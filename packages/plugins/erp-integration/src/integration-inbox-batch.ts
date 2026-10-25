import { Logger } from '@nestjs/common';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, lockAggregates } from 'shared';

import type { NonRetryableInboundError } from './non-retryable-inbound-error';
import type { BatchInboundStreamHandler } from './handlers/inbound-stream-handler';
import type { ClaimedInboxEvent, IntegrationInboxService } from './integration-inbox.service';
import { settleProcessedBatch } from './integration-inbox-settle';
import type { ProcessedMark } from './integration-inbox-settle';
import { loggerCtx } from './types';
import type { InboundStream } from './types';
import { isVersionNewer } from './version-compare';

export interface InboxBatchResult {
    settled: number;
    invalid: Array<{ row: ClaimedInboxEvent; error: NonRetryableInboundError }>;
}

// Each row takes advisory locks from the shared lock table; a full 500-row claim in one transaction could exhaust it.
export const BATCH_TX_MAX_ROWS = 200;

export const inboxEntityLockKey = (stream: string, entityId: string): string =>
    `inbox-entity:${stream}:${entityId}`;

async function newestProcessedVersions(
    connection: TransactionalConnection,
    ctx: RequestContext,
    stream: InboundStream,
    entityIds: string[],
): Promise<Map<string, string>> {
    const rows = await ctxQuery<Array<{ entity_id: string; version: string }>>(
        connection,
        ctx,
        `SELECT entity_id, version FROM integration_inbox_event
          WHERE stream = $1 AND entity_id = ANY($2::text[]) AND status = 'processed'`,
        [stream, entityIds],
    );
    const newest = new Map<string, string>();
    for (const row of rows) {
        const seen = newest.get(row.entity_id);
        if (seen === undefined || isVersionNewer(row.version, seen)) {
            newest.set(row.entity_id, row.version);
        }
    }
    return newest;
}

// One transaction per chunk of sorted rows: locks, superseded check, handler batch, one outcome UPDATE.
// Throws on any failure so the caller can roll back and retry row by row.
async function applyInboxBatch(
    connection: TransactionalConnection,
    ctx: RequestContext,
    stream: InboundStream,
    handler: BatchInboundStreamHandler,
    rows: ClaimedInboxEvent[],
): Promise<InboxBatchResult> {
    return connection.withTransaction(ctx, async txCtx => {
        await lockAggregates(
            connection,
            txCtx,
            rows.map(row => inboxEntityLockKey(stream, row.entityId)),
        );
        const newest = await newestProcessedVersions(connection, txCtx, stream, [
            ...new Set(rows.map(row => row.entityId)),
        ]);
        const marks: ProcessedMark[] = [];
        const toApply: ClaimedInboxEvent[] = [];
        for (const row of rows) {
            const processedVersion = newest.get(row.entityId);
            if (processedVersion !== undefined && isVersionNewer(processedVersion, row.version)) {
                marks.push({
                    id: row.id,
                    outcome: 'superseded',
                    reason: 'a newer version was already processed',
                });
            } else {
                toApply.push(row);
            }
        }
        const invalid: InboxBatchResult['invalid'] = [];
        if (toApply.length > 0) {
            const results = await handler.applyBatch(
                txCtx,
                toApply.map(row => ({ entityId: row.entityId, payload: row.payload })),
            );
            results.forEach((result, i) => {
                if (result.kind === 'invalid') {
                    invalid.push({ row: toApply[i], error: result.error });
                } else if (result.kind === 'noop') {
                    marks.push({ id: toApply[i].id, outcome: 'noop', reason: result.reason });
                } else {
                    marks.push({ id: toApply[i].id, outcome: 'applied', reason: null });
                }
            });
        }
        const settled = await settleProcessedBatch(connection, txCtx, marks, rows[0].claimToken);
        if (settled !== marks.length) {
            throw new Error(
                `inbox batch lost its claim: settled ${settled} of ${marks.length} row(s) of ${stream}`,
            );
        }
        return { settled, invalid };
    });
}

// Any failure rolls the batch back and the rows go through the per-row path, so one bad row never
// fails the rest. Invalid payloads become visible failed rows after the batch commits.
export async function processStreamBatch(
    deps: { connection: TransactionalConnection; inbox: IntegrationInboxService },
    ctx: RequestContext,
    stream: InboundStream,
    handler: BatchInboundStreamHandler,
    rows: ClaimedInboxEvent[],
    processOne: (row: ClaimedInboxEvent) => Promise<boolean>,
    pastDeadline: () => boolean = () => false,
): Promise<{ processed: number; failed: number; unprocessed: ClaimedInboxEvent[] }> {
    try {
        const { settled, invalid } = await applyInboxBatch(
            deps.connection,
            ctx,
            stream,
            handler,
            rows,
        );
        for (const { row, error } of invalid) {
            Logger.error(
                `Failed processing ${stream} entityId=${row.entityId}: ${error.message}`,
                loggerCtx,
            );
            await deps.inbox.markFailed(ctx, row.id, error, Math.random, null, row.claimToken);
        }
        return { processed: settled, failed: invalid.length, unprocessed: [] };
    } catch (err) {
        Logger.warn(
            `Batch of ${rows.length} ${stream} row(s) rolled back, retrying one by one: ${err instanceof Error ? err.message : String(err)}`,
            loggerCtx,
        );
        let processed = 0;
        let failed = 0;
        const unprocessed: ClaimedInboxEvent[] = [];
        for (const row of rows) {
            if (pastDeadline()) {
                unprocessed.push(row);
            } else if (await processOne(row)) {
                processed += 1;
            } else {
                failed += 1;
            }
        }
        return { processed, failed, unprocessed };
    }
}
