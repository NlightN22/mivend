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
                const policies = await this.policies.ensureForStage(txCtx, providers, stage);
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

    async findResults(
        ctx: RequestContext,
        subjectType: string,
        subjectId: string,
    ): Promise<CheckResult[]> {
        const definition = this.registry.findSubjectType(subjectType);
        if (definition?.visibleSubjectIds) {
            const ids = await definition.visibleSubjectIds(ctx, [subjectId]);
            if (!ids.has(subjectId)) {
                return [];
            }
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
