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
import { ReconciliationIssues } from './reconciliation-issues';
import type { OpenErpReconciliationIssueListOptions } from './reconciliation-issues';
import type { ErpReconciliationState } from './entities/erp-reconciliation-state.entity';
import type { ErpReconciliationTrigger } from './entities/erp-reconciliation-issue.entity';
import {
    COMPARED_AGGREGATE_TYPES,
    ReconciliationLocalCountsService,
} from './reconciliation-local-counts.service';
import { ReconciliationSummaryClient } from './reconciliation-summary.client';
import type { ReconciliationSummary } from './reconciliation-summary.client';
import { IntegrationInboxHealthService } from './integration-inbox-health.service';
import { resolveTheirCount } from './reconciliation-decision';
import { RECONCILED_STREAMS } from './reconciled-streams';
import { ReconciliationHealService } from './reconciliation-heal.service';
import { ReconciliationStateService } from './reconciliation-state.service';
import type { ComparisonSignals } from './reconciliation-state';
import { ALL_INBOUND_STREAMS, loggerCtx } from './types';
import type { IntegrationInboxBacklogByStream } from './integration-inbox-health.service';

export const FAILED_INBOX_ISSUE_PREFIX = 'inbox-failed:';
export const MISSING_COORDINATES_AGGREGATE = 'trading-point-no-coordinates';
export const SEEDING_STUCK_PREFIX = 'seeding-stuck:';
export const HEAL_ALARM_PREFIX = 'heal-alarm:';

const STREAM_OF_AGGREGATE = new Map<string, string>(
    Object.entries(RECONCILED_STREAMS).map(([stream, type]) => [type as string, stream]),
);

function signalsFor(
    aggregateType: string,
    summary: ReconciliationSummary,
    backlog: Map<string, IntegrationInboxBacklogByStream> | null,
): ComparisonSignals {
    const stream = STREAM_OF_AGGREGATE.get(aggregateType);
    const row = stream ? backlog?.get(stream) : undefined;
    const known = backlog !== null;
    return {
        inboxBacklog: known
            ? row
                ? row.pending + row.processing + row.dependencyMissing + row.replayPending
                : 0
            : null,
        inboxFailed: known ? (row?.failed ?? 0) : null,
        sourceQueue:
            aggregateType === 'customer-order' ? (summary.pendingPublish ?? null) : undefined,
    };
}

export interface RunComparisonInput {
    triggeredBy: ErpReconciliationTrigger;
    triggeredByAdministratorId?: string;
}

export interface RunComparisonResult {
    checked: number;
    issuesFound: number;
    skipped: string[];
}

export type { OpenErpReconciliationIssueListOptions } from './reconciliation-issues';

// Shared by the scheduled task and manual admin mutation; must never auto-resolve a discrepancy.
// Every mismatch is persisted as an open ErpReconciliationIssue for a human to act on.
@Injectable()
export class ReconciliationService {
    private readonly issues: ReconciliationIssues;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        private readonly summaryClient: ReconciliationSummaryClient,
        private readonly localCounts: ReconciliationLocalCountsService,
        private readonly notificationService: NotificationService,
        private readonly inboxHealth: IntegrationInboxHealthService,
        private readonly locationReport: TradingPointLocationReportService,
        private readonly states: ReconciliationStateService,
        private readonly heal: ReconciliationHealService,
    ) {
        this.issues = new ReconciliationIssues(connection, notificationService);
    }

    async runComparison(input: RunComparisonInput): Promise<RunComparisonResult> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const skipped: string[] = [];
        let issuesFound = 0;
        let checked = 0;
        const backlog = await this.readBacklog(ctx);

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

            const state = await this.states.record(ctx, {
                aggregateType,
                ourCount,
                theirCount,
                signals: signalsFor(aggregateType, summary, backlog),
                now: new Date(),
            });
            issuesFound += await this.actOnState(ctx, input, state, ourCount, theirCount);
        }

        issuesFound += await this.reconcileFailedInboxRows(ctx, input);
        issuesFound += await this.reconcileMissingCoordinates(ctx, input);
        return { checked, issuesFound, skipped };
    }

    // Only a stalled gap is real drift and only it is healed; seeding and converging gaps are recorded in the state row.
    private async actOnState(
        ctx: RequestContext,
        input: RunComparisonInput,
        state: ErpReconciliationState,
        ourCount: number,
        theirCount: number,
    ): Promise<number> {
        const { aggregateType } = state;
        const trigger = {
            triggeredBy: input.triggeredBy,
            triggeredByAdministratorId: input.triggeredByAdministratorId ?? null,
        };
        if (state.state === 'in-sync') {
            for (const key of [
                aggregateType,
                SEEDING_STUCK_PREFIX + aggregateType,
                HEAL_ALARM_PREFIX + aggregateType,
            ]) {
                await this.issues.autoResolveIfOpen(ctx, key);
            }
            return 0;
        }
        let found = 0;
        if (state.seedingAlarm) {
            await this.issues.recordIssue(ctx, {
                aggregateType: SEEDING_STUCK_PREFIX + aggregateType,
                issueType: 'seeding-stuck',
                ourCount,
                theirActiveCount: theirCount,
                ...trigger,
            });
            found += 1;
        } else {
            await this.issues.autoResolveIfOpen(ctx, SEEDING_STUCK_PREFIX + aggregateType);
        }
        if (state.state !== 'stalled') return found;
        await this.issues.recordIssue(ctx, {
            aggregateType,
            ourCount,
            theirActiveCount: theirCount,
            ...trigger,
        });
        found += 1;
        const report = await this.heal.healIfDue(ctx, aggregateType);
        if (report.alarm) {
            await this.issues.recordIssue(ctx, {
                aggregateType: HEAL_ALARM_PREFIX + aggregateType,
                issueType: 'heal-alarm',
                ourCount,
                theirActiveCount: theirCount,
                ...trigger,
            });
            found += 1;
        }
        return found;
    }

    // An unreadable backlog is an unknown signal for every kind, never an empty one.
    private async readBacklog(
        ctx: RequestContext,
    ): Promise<Map<string, IntegrationInboxBacklogByStream> | null> {
        try {
            const rows = await this.inboxHealth.getBacklogByStream(ctx);
            return new Map(rows.map(r => [r.stream as string, r]));
        } catch (err) {
            Logger.error(
                `Reconciliation could not read the inbox backlog: ${err instanceof Error ? err.message : String(err)}`,
                loggerCtx,
            );
            return null;
        }
    }

    // ERP points may arrive without coordinates; they stay valid but are reported until backfilled.
    private async reconcileMissingCoordinates(
        ctx: RequestContext,
        input: RunComparisonInput,
    ): Promise<number> {
        const missing = await this.locationReport.countMissing(ctx);
        if (missing === 0) {
            await this.issues.autoResolveIfOpen(ctx, MISSING_COORDINATES_AGGREGATE);
            return 0;
        }
        await this.issues.recordIssue(ctx, {
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
                await this.issues.recordIssue(ctx, {
                    aggregateType,
                    issueType: 'failed-inbox-rows',
                    ourCount: failed,
                    theirActiveCount: 0,
                    triggeredBy: input.triggeredBy,
                    triggeredByAdministratorId: input.triggeredByAdministratorId ?? null,
                });
                found += 1;
            } else {
                await this.issues.autoResolveIfOpen(ctx, aggregateType);
            }
        }
        return found;
    }

    async findOpen(
        ctx: RequestContext,
        options?: OpenErpReconciliationIssueListOptions,
    ): Promise<PaginatedList<ErpReconciliationIssue>> {
        return this.issues.findOpen(ctx, options);
    }

    async resolve(
        ctx: RequestContext,
        input: { id: string; resolution: string },
    ): Promise<ErpReconciliationIssue> {
        return this.issues.resolve(ctx, input);
    }
}
