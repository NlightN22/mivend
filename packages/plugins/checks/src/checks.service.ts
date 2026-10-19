import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';

import { CheckPolicyService } from './check-policy.service';
import { CheckRegistry } from './check-registry';
import { CheckResult } from './entities/check-result.entity';
import type { CheckProvider, SubjectTypeDefinition } from './registry-types';
import {
    CONSEQUENCE_STRENGTH,
    CheckRunResult,
    Consequence,
    Finding,
    ResolvedFinding,
} from './types';

export function strongestConsequence(findings: { consequence: Consequence }[]): Consequence | null {
    let strongest: Consequence | null = null;
    for (const { consequence } of findings) {
        if (
            strongest === null ||
            CONSEQUENCE_STRENGTH[consequence] > CONSEQUENCE_STRENGTH[strongest]
        ) {
            strongest = consequence;
        }
    }
    return strongest;
}

@Injectable()
export class ChecksService {
    private readonly logger = new Logger(ChecksService.name);

    constructor(
        private connection: TransactionalConnection,
        private registry: CheckRegistry,
        private policies: CheckPolicyService,
    ) {}

    // A provider that throws fails the whole run and rolls back: the previous stored results stay,
    // so a broken check can never read as "no findings".
    async runChecks(
        ctx: RequestContext,
        subjectType: string,
        subjectRef: string,
        stage: string,
    ): Promise<CheckRunResult> {
        const definition = this.registry.getSubjectType(subjectType);
        const providers = this.registry.listForStage(subjectType, stage);
        const { loadSubject, lockKey } = definition;
        if (definition.ephemeral || !loadSubject || !lockKey) {
            throw new Error(`Subject type "${subjectType}" is ephemeral: use evaluate`);
        }

        return withAggregateLock(this.connection, ctx, lockKey(subjectRef), async txCtx => {
            const subject = await loadSubject(txCtx, subjectRef);
            if (subject === null || subject === undefined) {
                throw new Error(`Subject ${subjectType}:${subjectRef} not found`);
            }
            const resolved = await this.evaluateProviders(
                txCtx,
                definition,
                providers,
                subject,
                stage,
                true,
            );
            await this.replaceResults(
                txCtx,
                subjectType,
                subjectRef,
                stage,
                resolved,
                definition.dataVersion?.(subject) ?? null,
            );
            return { findings: resolved, strongestConsequence: strongestConsequence(resolved) };
        });
    }

    // Pure path for an ephemeral subject (an action being requested): same providers and policies as
    // `runChecks`, but no lock and nothing stored; the caller acts on the returned consequence.
    async evaluate(
        ctx: RequestContext,
        subjectType: string,
        subject: unknown,
        stage: string,
    ): Promise<CheckRunResult> {
        const definition = this.registry.getSubjectType(subjectType);
        if (!definition.ephemeral) {
            throw new Error(`Subject type "${subjectType}" is stored: use runChecks`);
        }
        const providers = this.registry.listForStage(subjectType, stage);
        const resolved = await this.evaluateProviders(
            ctx,
            definition,
            providers,
            subject,
            stage,
            false,
        );
        return { findings: resolved, strongestConsequence: strongestConsequence(resolved) };
    }

    private async evaluateProviders(
        ctx: RequestContext,
        definition: SubjectTypeDefinition,
        providers: CheckProvider[],
        subject: unknown,
        stage: string,
        lockPolicyRows: boolean,
    ): Promise<ResolvedFinding[]> {
        const branchId = definition.branchId?.(subject) ?? null;
        const policies = lockPolicyRows
            ? await this.policies.ensureForStage(ctx, providers, stage, true, branchId)
            : await this.policies.effectiveForStage(ctx, providers, stage, branchId);
        const resolved: ResolvedFinding[] = [];
        for (const provider of providers) {
            const policy = policies.get(provider.code);
            if (!policy?.enabled) {
                continue;
            }
            let findings: Finding[];
            try {
                findings = await provider.evaluate(subject, {
                    ctx,
                    stage,
                    recipient: policy.recipient,
                });
            } catch (error) {
                this.logger.error(
                    `Check ${provider.code} failed for ${definition.type}`,
                    error instanceof Error ? error.stack : String(error),
                );
                throw error;
            }
            for (const finding of findings) {
                resolved.push({
                    ...finding,
                    checkCode: provider.code,
                    consequence: policy.consequence,
                });
            }
        }
        return resolved;
    }

    async markStale(ctx: RequestContext, subjectType: string, subjectId: string): Promise<void> {
        const lockKey = this.registry.getSubjectType(subjectType).lockKey;
        if (!lockKey) {
            throw new Error(`Subject type "${subjectType}" stores no results`);
        }
        await withAggregateLock(this.connection, ctx, lockKey(subjectId), async txCtx => {
            await this.connection
                .getRepository(txCtx, CheckResult)
                .update({ subjectType, subjectId }, { stale: true });
        });
    }

    // Keyset over subjects, each flagged under its own lock: never a mass UPDATE that could wait on a running recompute.
    async markStaleByCheckCode(ctx: RequestContext, checkCode: string): Promise<void> {
        type SubjectRow = { subjectType: string; subjectId: string };
        let last: SubjectRow | null = null;
        for (;;) {
            const rows: SubjectRow[] = await ctxQuery<SubjectRow[]>(
                this.connection,
                ctx,
                `SELECT DISTINCT "subjectType", "subjectId" FROM check_result
                      WHERE "checkCode" = $1 AND stale = false
                        AND ($2::text IS NULL OR ("subjectType", "subjectId") > ($2, $3))
                      ORDER BY "subjectType", "subjectId" LIMIT 200`,
                [checkCode, last?.subjectType ?? null, last?.subjectId ?? null],
            );
            for (const row of rows) {
                // An unregistered type here throws, so the request is kept until a process that knows it runs.
                await this.markStale(ctx, row.subjectType, row.subjectId);
            }
            if (rows.length < 200) return;
            last = rows[rows.length - 1];
        }
    }

    async findResults(
        ctx: RequestContext,
        subjectType: string,
        subjectId: string,
    ): Promise<CheckResult[]> {
        const definition = this.registry.findSubjectType(subjectType);
        // Fail closed: an unknown subject type, or one without a visibility rule, exposes nothing.
        if (typeof definition?.visibleSubjectIds !== 'function') {
            return [];
        }
        const ids = await definition.visibleSubjectIds(ctx, [subjectId]);
        if (!ids.has(subjectId)) {
            return [];
        }
        return this.connection.getRepository(ctx, CheckResult).find({
            where: { subjectType, subjectId },
            order: { id: 'ASC' },
        });
    }

    private async replaceResults(
        txCtx: RequestContext,
        subjectType: string,
        subjectId: string,
        stage: string,
        findings: ResolvedFinding[],
        dataVersion: string | null,
    ): Promise<void> {
        const repo = this.connection.getRepository(txCtx, CheckResult);
        await repo.delete({ subjectType, subjectId, stage });
        if (findings.length === 0) {
            return;
        }
        const computedAt = new Date();
        await repo.save(
            findings.map(
                f =>
                    new CheckResult({
                        subjectType,
                        subjectId,
                        stage,
                        checkCode: f.checkCode,
                        lineRef: f.lineRef ?? null,
                        severity: f.severity,
                        messageKey: f.messageKey,
                        facts: f.facts,
                        dataVersion,
                        computedAt,
                        stale: false,
                    }),
            ),
        );
    }
}
