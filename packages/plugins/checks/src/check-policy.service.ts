import { Injectable } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { randomUUID } from 'node:crypto';
import { withAggregateLock } from 'shared';
import { In } from 'typeorm';

import { CheckRegistry } from './check-registry';
import { CheckPolicyChangedEvent } from './check-policy-changed.event';
import { CheckPolicy } from './entities/check-policy.entity';
import { CheckPolicyHistory } from './entities/check-policy-history.entity';
import { CheckResult } from './entities/check-result.entity';
import type { CheckProvider } from './registry-types';
import { CONSEQUENCES, Consequence, DEFAULT_CONSEQUENCE } from './types';

export interface UpdateCheckPolicyInput {
    checkCode: string;
    stage: string;
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
    ) {}

    // A missing row is created from the provider's declared default (warn unless it says otherwise).
    // `lockRows` (runs) share-locks the rows: a concurrent policy update waits, then marks the results stale.
    async ensureForStage(
        ctx: RequestContext,
        providers: CheckProvider[],
        stage: string,
        lockRows = false,
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
                    consequence: p.defaultConsequence ?? DEFAULT_CONSEQUENCE,
                    recipient: null,
                    enabled: true,
                })),
            )
            .orIgnore()
            .execute();
        const rows = await repo.find({
            where: { stage, checkCode: In(providers.map(p => p.code)) },
            ...(lockRows ? { lock: { mode: 'pessimistic_read' as const } } : {}),
        });
        return new Map(rows.map(row => [row.checkCode, row]));
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
            order: { checkCode: 'ASC', stage: 'ASC' },
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
        if (!subjectType.allowedConsequences.includes(input.consequence)) {
            throw new Error(
                `Consequence "${input.consequence}" is not allowed for subject type "${subjectType.type}"`,
            );
        }
        return withAggregateLock(
            this.connection,
            ctx,
            `check-policy:${input.checkCode}:${input.stage}`,
            async txCtx => {
                await this.ensureForStage(txCtx, [provider], input.stage);
                const repo = this.connection.getRepository(txCtx, CheckPolicy);
                const row = await repo.findOneOrFail({
                    where: { checkCode: input.checkCode, stage: input.stage },
                });
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
                    await this.connection
                        .getRepository(txCtx, CheckResult)
                        .update({ checkCode: input.checkCode, stale: false }, { stale: true });
                    this.eventBus.publish(
                        new CheckPolicyChangedEvent(txCtx, input.checkCode, input.stage, before),
                    );
                }
                return saved;
            },
        );
    }
}
