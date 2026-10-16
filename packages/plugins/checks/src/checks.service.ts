import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { CheckPolicyService } from './check-policy.service';
import { CheckRegistry } from './check-registry';
import { CheckResult } from './entities/check-result.entity';
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

        return withAggregateLock(
            this.connection,
            ctx,
            definition.lockKey(subjectRef),
            async txCtx => {
                const subject = await definition.loadSubject(txCtx, subjectRef);
                if (subject === null || subject === undefined) {
                    throw new Error(`Subject ${subjectType}:${subjectRef} not found`);
                }
                const branchId = definition.branchId?.(subject) ?? null;
                const policies = await this.policies.ensureForStage(
                    txCtx,
                    providers,
                    stage,
                    true,
                    branchId,
                );
                const resolved: ResolvedFinding[] = [];
                for (const provider of providers) {
                    const policy = policies.get(provider.code);
                    if (!policy?.enabled) {
                        continue;
                    }
                    let findings: Finding[];
                    try {
                        findings = await provider.evaluate(subject, { ctx: txCtx, stage });
                    } catch (error) {
                        this.logger.error(
                            `Check ${provider.code} failed for ${subjectType}:${subjectRef}`,
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
                await this.replaceResults(
                    txCtx,
                    subjectType,
                    subjectRef,
                    stage,
                    resolved,
                    definition.dataVersion?.(subject) ?? null,
                );
                return { findings: resolved, strongestConsequence: strongestConsequence(resolved) };
            },
        );
    }

    async markStale(ctx: RequestContext, subjectType: string, subjectId: string): Promise<void> {
        const definition = this.registry.getSubjectType(subjectType);
        await withAggregateLock(
            this.connection,
            ctx,
            definition.lockKey(subjectId),
            async txCtx => {
                await this.connection
                    .getRepository(txCtx, CheckResult)
                    .update({ subjectType, subjectId }, { stale: true });
            },
        );
    }

    // Keyset over subjects, each flagged under its own lock: never a mass UPDATE that could wait on a running recompute.
    async markStaleByCheckCode(ctx: RequestContext, checkCode: string): Promise<void> {
        let last: { subjectType: string; subjectId: string } | null = null;
        for (;;) {
            const rows: Array<{ subjectType: string; subjectId: string }> =
                await this.connection.rawConnection.query(
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
