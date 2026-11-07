import { Injectable, Logger } from '@nestjs/common';
import {
    PaginatedList,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';
import { TradingPointLocationReportService } from '@mivend/plugin-counterparty';

import { ErpReconciliationIssue } from './entities/erp-reconciliation-issue.entity';
import type {
    ErpReconciliationIssueType,
    ErpReconciliationTrigger,
} from './entities/erp-reconciliation-issue.entity';
import {
    COMPARED_AGGREGATE_TYPES,
    ReconciliationLocalCountsService,
} from './reconciliation-local-counts.service';
import { ReconciliationSummaryClient } from './reconciliation-summary.client';
import type { ReconciliationSummary } from './reconciliation-summary.client';
import { IntegrationInboxHealthService } from './integration-inbox-health.service';
import { classifyDiscrepancy, resolveTheirCount } from './reconciliation-decision';
import { ALL_INBOUND_STREAMS, loggerCtx } from './types';

export const FAILED_INBOX_ISSUE_PREFIX = 'inbox-failed:';
export const MISSING_COORDINATES_AGGREGATE = 'trading-point-no-coordinates';

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

// Shared by the scheduled task and manual admin mutation; must never auto-resolve a discrepancy.
// Every mismatch is persisted as an open ErpReconciliationIssue for a human to act on.
@Injectable()
export class ReconciliationService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        private readonly summaryClient: ReconciliationSummaryClient,
        private readonly localCounts: ReconciliationLocalCountsService,
        private readonly notificationService: NotificationService,
        private readonly inboxHealth: IntegrationInboxHealthService,
        private readonly locationReport: TradingPointLocationReportService,
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

            let theirCount: number;
            try {
                theirCount = resolveTheirCount(summary);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                Logger.error(`Reconciliation skipped for ${aggregateType}: ${message}`, loggerCtx);
                skipped.push(aggregateType);
                continue;
            }
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
            } else {
                await this.autoResolveIfOpen(ctx, aggregateType);
            }
        }

        issuesFound += await this.reconcileFailedInboxRows(ctx, input);
        issuesFound += await this.reconcileMissingCoordinates(ctx, input);
        return { checked, issuesFound, skipped };
    }

    // ERP points may arrive without coordinates; they stay valid but are reported until backfilled.
    private async reconcileMissingCoordinates(
        ctx: RequestContext,
        input: RunComparisonInput,
    ): Promise<number> {
        const missing = await this.locationReport.countMissing(ctx);
        if (missing === 0) {
            await this.autoResolveIfOpen(ctx, MISSING_COORDINATES_AGGREGATE);
            return 0;
        }
        await this.recordIssue(ctx, {
            aggregateType: MISSING_COORDINATES_AGGREGATE,
            issueType: 'missing-coordinates',
            ourCount: missing,
            theirActiveCount: 0,
            triggeredBy: input.triggeredBy,
            triggeredByAdministratorId: input.triggeredByAdministratorId ?? null,
        });
        return 1;
    }

    // Failed rows never leave the inbox on their own; one open issue per stream until none remain.
    private async reconcileFailedInboxRows(
        ctx: RequestContext,
        input: RunComparisonInput,
    ): Promise<number> {
        const backlog = await this.inboxHealth.getBacklogByStream(ctx);
        const failedByStream = new Map(backlog.map(b => [b.stream as string, b.failed]));
        const streams = new Set<string>([...ALL_INBOUND_STREAMS, ...failedByStream.keys()]);
        let found = 0;
        for (const stream of streams) {
            const aggregateType = `${FAILED_INBOX_ISSUE_PREFIX}${stream}`;
            const failed = failedByStream.get(stream) ?? 0;
            if (failed > 0) {
                await this.recordIssue(ctx, {
                    aggregateType,
                    issueType: 'failed-inbox-rows',
                    ourCount: failed,
                    theirActiveCount: 0,
                    triggeredBy: input.triggeredBy,
                    triggeredByAdministratorId: input.triggeredByAdministratorId ?? null,
                });
                found += 1;
            } else {
                await this.autoResolveIfOpen(ctx, aggregateType);
            }
        }
        return found;
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
        const saved = await repo.save(issue);
        await this.notificationService.resolveBySource(
            ctx,
            { sourceType: 'erp-reconciliation', sourceId: saved.aggregateType },
            input.resolution,
        );
        return saved;
    }

    // recordIssue only runs on mismatch, so a resolved drift would leave a stale open issue forever.
    // Safe to auto-close here: both counts were just re-verified equal, so nothing is guessed.
    private async autoResolveIfOpen(ctx: RequestContext, aggregateType: string): Promise<void> {
        const repo = this.connection.getRepository(ctx, ErpReconciliationIssue);
        const existing = await repo.findOne({ where: { aggregateType, status: 'open' } });
        if (!existing) return;
        const resolution = 'Auto-resolved: counts matched on a later reconciliation run.';
        existing.status = 'resolved';
        existing.resolution = resolution;
        await repo.save(existing);
        await this.notificationService.resolveBySource(
            ctx,
            { sourceType: 'erp-reconciliation', sourceId: aggregateType },
            resolution,
        );
    }

    // Persistent drift is re-detected on every scheduled run; update the open issue per aggregateType
    // in place instead of adding a row daily; a new row only after the prior one is resolved.
    private async recordIssue(
        ctx: RequestContext,
        params: {
            aggregateType: string;
            issueType?: ErpReconciliationIssueType;
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
            issueType:
                params.issueType ?? classifyDiscrepancy(params.ourCount, params.theirActiveCount),
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

        // Scheduled runs have no administrator to notify; a re-detected open issue is not re-announced.
        if (!existing && params.triggeredByAdministratorId) {
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
