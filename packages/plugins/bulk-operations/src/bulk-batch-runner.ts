import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';

import type { BulkExecutor, BulkRecordVerdict } from './bulk-executor';
import { BulkExecutorRegistry } from './bulk-executor-registry';
import {
    actorHoldsPermission,
    findBatch,
    pendingItems,
    recordOutcome,
    refreshCounters,
    skipPending,
} from './bulk-batch.sql';
import { RUN_CHUNK, loggerCtx, type BulkBatchRow, type BulkItemRow } from './types';

@Injectable()
export class BulkBatchRunner {
    constructor(
        private connection: TransactionalConnection,
        private registry: BulkExecutorRegistry,
    ) {}

    // Safe to call repeatedly: only the call that claims a queued (or orphaned running) batch does any work.
    async execute(ctx: RequestContext, uuid: string): Promise<void> {
        const batch = await this.claim(ctx, uuid);
        if (!batch) return;
        try {
            const executor = this.registry.get(batch.operationType);
            let stopped: string | null = null;
            for (;;) {
                // A batch runs with the rights its creator holds when each chunk starts.
                if (
                    !(await actorHoldsPermission(
                        this.connection,
                        ctx,
                        batch.createdById,
                        executor.permission,
                    ))
                ) {
                    const left = await skipPending(
                        this.connection,
                        ctx,
                        batch.id,
                        'actor_not_allowed',
                        'The administrator no longer holds the right to run this operation',
                    );
                    if (left > 0)
                        stopped = `Stopped: the administrator was no longer allowed to run this operation; ${left} records were not processed`;
                    break;
                }
                const chunk = await pendingItems(this.connection, ctx, batch.id, RUN_CHUNK);
                if (chunk.length === 0) break;
                for (const item of chunk) {
                    await this.applyOne(ctx, executor, batch, item);
                }
                await refreshCounters(this.connection, ctx, batch.id);
            }
            await this.finish(ctx, batch.id, null, stopped);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            Logger.error(`Batch ${batch.uuid} stopped: ${message}`, loggerCtx);
            await this.finish(ctx, batch.id, message, null);
            throw e;
        }
    }

    private async claim(ctx: RequestContext, uuid: string): Promise<BulkBatchRow | null> {
        return withAggregateLock(this.connection, ctx, `bulk-batch:${uuid}`, async txCtx => {
            const batch = await findBatch(this.connection, txCtx, uuid, true);
            if (!batch || (batch.status !== 'queued' && !batch.stale)) return null;
            await ctxQuery(
                this.connection,
                txCtx,
                `UPDATE bulk_batch SET status = 'running', "startedAt" = COALESCE("startedAt", now()), "updatedAt" = now() WHERE id = $1`,
                [batch.id],
            );
            return batch;
        });
    }

    // Permission and scope are decided per record; one record's failure never stops the rest.
    private async applyOne(
        ctx: RequestContext,
        executor: BulkExecutor,
        batch: BulkBatchRow,
        item: BulkItemRow,
    ): Promise<void> {
        let result: Omit<BulkRecordVerdict, 'outcome'> & { outcome: string };
        try {
            this.registry.assertAllowed(ctx, executor);
            result = await executor.apply(ctx, item.targetId, batch.parameters);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            Logger.warn(
                `Batch ${batch.uuid} record ${item.targetId} failed: ${message}`,
                loggerCtx,
            );
            result = { outcome: 'failed', reasonCode: 'error', message, label: null };
        }
        await recordOutcome(this.connection, ctx, item.id, result);
    }

    private async finish(
        ctx: RequestContext,
        batchId: number,
        error: string | null,
        stopped: string | null,
    ): Promise<void> {
        await refreshCounters(this.connection, ctx, batchId);
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE bulk_batch SET "finishedAt" = now(), "updatedAt" = now(), "errorMessage" = COALESCE($2, $3),
                status = CASE WHEN $2::text IS NOT NULL THEN 'failed'
                    WHEN $3::text IS NOT NULL THEN 'stopped'
                    WHEN "failedCount" = 0 THEN 'done'
                    WHEN "appliedCount" = 0 AND "skippedCount" = 0 THEN 'failed'
                    ELSE 'partial' END
             WHERE id = $1`,
            [batchId, error, stopped],
        );
    }
}
