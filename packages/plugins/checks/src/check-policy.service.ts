import { Injectable } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { randomUUID } from 'node:crypto';
import { Branch } from '@mivend/plugin-access-control';
import { withAggregateLock } from 'shared';
import { In, IsNull, Repository } from 'typeorm';

import { CheckRegistry } from './check-registry';
import { CheckPolicyChangedEvent } from './check-policy-changed.event';
import { CheckPolicy } from './entities/check-policy.entity';
import { CheckPolicyHistory } from './entities/check-policy-history.entity';
import { CHECK_CODE_KIND, CheckStaleRequestWriter } from './check-stale-request.writer';
import type { CheckProvider } from './registry-types';
import { CONSEQUENCES, Consequence } from './types';

export interface UpdateCheckPolicyInput {
    checkCode: string;
    stage: string;
    // Omitted/null edits the global row; a branch id creates or edits that branch's override.
    branchId?: string | null;
    consequence: Consequence;
    recipient?: string | null;
    enabled: boolean;
}

@Injectable()
export class CheckPolicyService {
    constructor(
        private connection: TransactionalConnection,
        private registry: CheckRegistry,
        private eventBus: EventBus,
        private staleRequests: CheckStaleRequestWriter,
    ) {}

    // A missing global row is created from the provider's declared default; a branch override row replaces it.
    // `lockRows` (runs) share-locks the rows: a concurrent policy update waits, then marks the results stale.
    async ensureForStage(
        ctx: RequestContext,
        providers: CheckProvider[],
        stage: string,
        lockRows = false,
        branchId: string | null = null,
    ): Promise<Map<string, CheckPolicy>> {
        const repo = this.connection.getRepository(ctx, CheckPolicy);
        if (providers.length === 0) {
            return new Map();
        }
        await repo
            .createQueryBuilder()
            .insert()
            .values(
                providers.map(p => ({
                    uuid: randomUUID(),
                    checkCode: p.code,
                    stage,
                    branchId: null,
                    consequence: this.registry.defaultConsequence(p, stage),
                    recipient: null,
                    enabled: this.registry.defaultEnabled(p, stage),
                })),
            )
            .orIgnore()
            .execute();
        const codes = providers.map(p => p.code);
        const lock = lockRows ? { lock: { mode: 'pessimistic_read' as const } } : {};
        const rows = await repo.find({
            where: { stage, checkCode: In(codes), branchId: IsNull() },
            ...lock,
        });
        const effective = new Map(rows.map(row => [row.checkCode, row]));
        if (branchId) {
            const overrides = await repo.find({
                where: { stage, checkCode: In(codes), branchId },
                ...lock,
            });
            for (const row of overrides) effective.set(row.checkCode, row);
        }
        return effective;
    }

    // The consequence a consumer outside `runChecks` (an interceptor, a placement decision) must apply.
    // Read-only: a missing row falls back to the provider's declared default, nothing is created.
    async resolve(
        ctx: RequestContext,
        checkCode: string,
        stage: string,
        branchId: string | null,
    ): Promise<{ consequence: Consequence; enabled: boolean }> {
        const provider = this.registry.getCheck(checkCode);
        if (!provider) {
            throw new Error(`Unknown check "${checkCode}"`);
        }
        const repo = this.connection.getRepository(ctx, CheckPolicy);
        const row =
            (branchId ? await repo.findOne({ where: { checkCode, stage, branchId } }) : null) ??
            (await repo.findOne({ where: { checkCode, stage, branchId: IsNull() } }));
        return row
            ? { consequence: row.consequence, enabled: row.enabled }
            : {
                  consequence: this.registry.defaultConsequence(provider, stage),
                  enabled: this.registry.defaultEnabled(provider, stage),
              };
    }

    async list(ctx: RequestContext, subjectType?: string): Promise<CheckPolicy[]> {
        const providers = this.registry.listChecks(subjectType);
        const stages = [...new Set(providers.flatMap(p => p.stages))];
        for (const stage of stages) {
            await this.ensureForStage(
                ctx,
                providers.filter(p => p.stages.includes(stage)),
                stage,
            );
        }
        if (providers.length === 0) {
            return [];
        }
        return this.connection.getRepository(ctx, CheckPolicy).find({
            where: { checkCode: In(providers.map(p => p.code)) },
            order: { checkCode: 'ASC', stage: 'ASC', branchId: 'ASC' },
        });
    }

    async update(ctx: RequestContext, input: UpdateCheckPolicyInput): Promise<CheckPolicy> {
        const provider = this.registry.getCheck(input.checkCode);
        if (!provider) {
            throw new Error(`Unknown check "${input.checkCode}"`);
        }
        if (!provider.stages.includes(input.stage)) {
            throw new Error(`Check "${input.checkCode}" does not run at stage "${input.stage}"`);
        }
        if (!CONSEQUENCES.includes(input.consequence)) {
            throw new Error(`Unknown consequence "${input.consequence}"`);
        }
        const subjectType = this.registry.getSubjectType(provider.subjectType);
        if (
            !this.registry.allowedConsequences(subjectType, input.stage).includes(input.consequence)
        ) {
            throw new Error(
                `Consequence "${input.consequence}" is not allowed for subject type "${subjectType.type}" at "${input.stage}"`,
            );
        }
        const branchId = input.branchId ?? null;
        if (branchId !== null) await this.assertBranchExists(ctx, branchId);
        return withAggregateLock(
            this.connection,
            ctx,
            `check-policy:${input.checkCode}:${input.stage}`,
            async txCtx => {
                await this.ensureForStage(txCtx, [provider], input.stage);
                const repo = this.connection.getRepository(txCtx, CheckPolicy);
                const row = await this.rowFor(repo, input.checkCode, input.stage, branchId);
                const before = {
                    consequence: row.consequence,
                    recipient: row.recipient,
                    enabled: row.enabled,
                };
                row.consequence = input.consequence;
                row.recipient = input.recipient ?? null;
                row.enabled = input.enabled;
                const saved = await repo.save(row);
                await this.connection.getRepository(txCtx, CheckPolicyHistory).save(
                    new CheckPolicyHistory({
                        checkPolicyId: Number(saved.id),
                        changedByUserId: ctx.activeUserId ? String(ctx.activeUserId) : null,
                        before,
                        after: {
                            consequence: saved.consequence,
                            recipient: saved.recipient,
                            enabled: saved.enabled,
                        },
                    }),
                );
                const changed =
                    before.consequence !== saved.consequence || before.enabled !== saved.enabled;
                if (changed) {
                    await this.staleRequests.request(txCtx, CHECK_CODE_KIND, input.checkCode);
                    this.eventBus.publish(
                        new CheckPolicyChangedEvent(txCtx, input.checkCode, input.stage, before),
                    );
                }
                return saved;
            },
        );
    }

    // Drops a branch override so the branch follows the global row again.
    async resetOverride(
        ctx: RequestContext,
        checkCode: string,
        stage: string,
        branchId: string,
    ): Promise<boolean> {
        return withAggregateLock(
            this.connection,
            ctx,
            `check-policy:${checkCode}:${stage}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, CheckPolicy);
                const row = await repo.findOne({ where: { checkCode, stage, branchId } });
                if (!row) return false;
                await this.connection.getRepository(txCtx, CheckPolicyHistory).save(
                    new CheckPolicyHistory({
                        checkPolicyId: Number(row.id),
                        changedByUserId: ctx.activeUserId ? String(ctx.activeUserId) : null,
                        before: {
                            consequence: row.consequence,
                            recipient: row.recipient,
                            enabled: row.enabled,
                        },
                        after: { removed: true },
                    }),
                );
                await repo.remove(row);
                await this.staleRequests.request(txCtx, CHECK_CODE_KIND, checkCode);
                this.eventBus.publish(
                    new CheckPolicyChangedEvent(txCtx, checkCode, stage, {
                        consequence: row.consequence,
                        enabled: row.enabled,
                    }),
                );
                return true;
            },
        );
    }

    // An override for a branch that does not exist could never apply and would only hide in the table.
    private async assertBranchExists(ctx: RequestContext, branchId: string): Promise<void> {
        const found =
            /^\d+$/.test(branchId) &&
            (await this.connection
                .getRepository(ctx, Branch)
                .count({ where: { id: Number(branchId) } })) > 0;
        if (!found) throw new Error(`Unknown branch "${branchId}"`);
    }

    // A branch row is created as a copy of the effective global row, then edited.
    private async rowFor(
        repo: Repository<CheckPolicy>,
        checkCode: string,
        stage: string,
        branchId: string | null,
    ): Promise<CheckPolicy> {
        const global = await repo.findOneOrFail({
            where: { checkCode, stage, branchId: IsNull() },
        });
        if (!branchId) return global;
        const existing = await repo.findOne({ where: { checkCode, stage, branchId } });
        return (
            existing ??
            repo.create({
                uuid: randomUUID(),
                checkCode,
                stage,
                branchId,
                consequence: global.consequence,
                recipient: global.recipient,
                enabled: global.enabled,
            })
        );
    }
}
