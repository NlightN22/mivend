import { Injectable, Logger } from '@nestjs/common';
import {
    PaginatedList,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';

import { ErpReconciliationIssue } from './entities/erp-reconciliation-issue.entity';
import type { ErpReconciliationTrigger } from './entities/erp-reconciliation-issue.entity';
import {
    COMPARED_AGGREGATE_TYPES,
    ReconciliationLocalCountsService,
} from './reconciliation-local-counts.service';
import { ReconciliationSummaryClient } from './reconciliation-summary.client';
import type { ReconciliationSummary } from './reconciliation-summary.client';
import { classifyDiscrepancy, resolveTheirCount } from './reconciliation-decision';
import { loggerCtx } from './types';

export interface RunComparisonInput {
    triggeredBy: ErpReconciliationTrigger;
    triggeredByAdministratorId?: string;
}

export interface RunComparisonResult {
    checked: number;
    issuesFound: number;
    skipped: string[];
}

export interface OpenErpReconciliationIssueListOptions {
    take?: number;
    skip?: number;
}

const OPEN_ISSUES_MAX_TAKE = 100;

// Single comparison entry point shared by the daily ScheduledTask and the manual admin mutation
// (issue #84) — one service method, two callers, per the issue's own explicit requirement. Never
// auto-resolves a discrepancy: every mismatch becomes a persisted, open ErpReconciliationIssue for
// a human to act on.
@Injectable()
export class ReconciliationService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        private readonly summaryClient: ReconciliationSummaryClient,
        private readonly localCounts: ReconciliationLocalCountsService,
        private readonly notificationService: NotificationService,
    ) {}

    async runComparison(input: RunComparisonInput): Promise<RunComparisonResult> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const skipped: string[] = [];
        let issuesFound = 0;
        let checked = 0;

        for (const aggregateType of COMPARED_AGGREGATE_TYPES) {
            let summaries: ReconciliationSummary[];
            try {
                summaries = await this.summaryClient.fetchSummaries(aggregateType);
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                Logger.error(
                    `Reconciliation summary fetch failed for aggregateType=${aggregateType}, skipping this run: ${error.message}`,
                    loggerCtx,
                );
                skipped.push(aggregateType);
                continue;
            }

            const summary = summaries.find(s => s.aggregateType === aggregateType);
            if (!summary) {
                Logger.warn(
                    `Reconciliation summary endpoint returned no entry for aggregateType=${aggregateType}`,
                    loggerCtx,
                );
                skipped.push(aggregateType);
                continue;
            }

            const theirCount = resolveTheirCount(summary);
            const ourCount = await this.localCounts.getLocalActiveCount(ctx, aggregateType);
            checked += 1;

            if (ourCount !== theirCount) {
                await this.recordIssue(ctx, {
                    aggregateType,
                    ourCount,
                    theirActiveCount: theirCount,
                    triggeredBy: input.triggeredBy,
                    triggeredByAdministratorId: input.triggeredByAdministratorId ?? null,
                });
                issuesFound += 1;
            }
        }

        return { checked, issuesFound, skipped };
    }

    async findOpen(
        ctx: RequestContext,
        options?: OpenErpReconciliationIssueListOptions,
    ): Promise<PaginatedList<ErpReconciliationIssue>> {
        const take = Math.min(options?.take ?? 20, OPEN_ISSUES_MAX_TAKE);
        const skip = options?.skip ?? 0;

        const [items, totalItems] = await this.connection
            .getRepository(ctx, ErpReconciliationIssue)
            .createQueryBuilder('issue')
            .where('issue.status = :status', { status: 'open' })
            .orderBy('issue.detectedAt', 'DESC')
            .addOrderBy('issue.id', 'DESC')
            .take(take)
            .skip(skip)
            .getManyAndCount();

        return { items, totalItems };
    }

    async resolve(
        ctx: RequestContext,
        input: { id: string; resolution: string },
    ): Promise<ErpReconciliationIssue> {
        const repo = this.connection.getRepository(ctx, ErpReconciliationIssue);
        const issue = await repo.findOneOrFail({ where: { id: input.id } });
        issue.status = 'resolved';
        issue.resolution = input.resolution;
        return repo.save(issue);
    }

    // Without this dedupe, a persistent drift (the exact scenario this issue was written for —
    // see the commit message) would insert a brand-new open row every single day forever, since
    // runComparison re-detects the same drift on every scheduled run (mivend.audit.85 HIGH
    // finding). Update the existing open issue for this aggregateType in place instead of
    // inserting a duplicate; a genuinely new occurrence only gets its own row once the previous
    // one has been resolved.
    private async recordIssue(
        ctx: RequestContext,
        params: {
            aggregateType: string;
            ourCount: number;
            theirActiveCount: number;
            triggeredBy: ErpReconciliationTrigger;
            triggeredByAdministratorId: string | null;
        },
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, ErpReconciliationIssue);
        const existing = await repo.findOne({
            where: { aggregateType: params.aggregateType, status: 'open' },
        });

        const fields = {
            issueType: classifyDiscrepancy(params.ourCount, params.theirActiveCount),
            aggregateType: params.aggregateType,
            ourCount: params.ourCount,
            theirActiveCount: params.theirActiveCount,
            detectedAt: new Date(),
            status: 'open' as const,
            resolution: null,
            triggeredBy: params.triggeredBy,
            triggeredByAdministratorId: params.triggeredByAdministratorId,
        };

        if (existing) {
            await repo.save(Object.assign(existing, fields));
        } else {
            await repo.save(new ErpReconciliationIssue(fields));
        }

        // Unlike the reservation/payment reconciliation issues, a manual re-run
        // (triggeredBy: 'manual') always carries the administrator who requested it — the one
        // case among these four call sites where a real recipient is known without inventing a
        // broadcast model. A 'scheduled' run has no administrator to notify, so it stays a
        // detected-but-unnotified issue, same as the other reconciliation plugins today.
        if (params.triggeredByAdministratorId) {
            await this.notificationService.create(ctx, {
                recipientType: 'administrator',
                recipientId: params.triggeredByAdministratorId,
                kind: 'warning',
                sourceType: 'erp-reconciliation',
                sourceId: params.aggregateType,
                title: 'ERP reconciliation drift detected',
                message: `${fields.issueType} for ${params.aggregateType} (ours=${params.ourCount}, theirs=${params.theirActiveCount})`,
            });
        }
    }
}
