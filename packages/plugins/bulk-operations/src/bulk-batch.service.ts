import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
    AdministratorService,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';

import type { BulkExecutor, BulkParameters } from './bulk-executor';
import { BulkExecutorRegistry } from './bulk-executor-registry';
import {
    findBatch,
    findDraftByHash,
    findUndoOf,
    insertBatch,
    upsertPreviewItems,
    type PreviewItemInput,
} from './bulk-batch.sql';
import { actorIdOf } from './actor-id';
import { BulkRunQueue } from './bulk-run-queue';
import { normaliseSelection, selectionHash } from './selection-hash';
import type { BulkBatchRow } from './types';

@Injectable()
export class BulkBatchService {
    constructor(
        private connection: TransactionalConnection,
        private registry: BulkExecutorRegistry,
        private runQueue: BulkRunQueue,
        private administratorService: AdministratorService,
    ) {}

    // The same actor previewing the same operation, parameters and selection reuses one draft.
    async preview(
        ctx: RequestContext,
        type: string,
        rawParameters: BulkParameters,
        ids: string[],
        undoOfBatchId: number | null = null,
    ): Promise<BulkBatchRow> {
        const executor = this.registry.get(type);
        this.registry.assertAllowed(ctx, executor);
        const parameters = executor.validate(rawParameters);
        const targetIds = normaliseSelection(ids);
        const hash = selectionHash(type, parameters, targetIds);
        const actor = await this.actorId(ctx);
        const verdicts = await this.inspectAll(ctx, executor, targetIds, parameters);

        return withAggregateLock(
            this.connection,
            ctx,
            `bulk-draft:${actor}:${hash}`,
            async txCtx => {
                const batch =
                    (await findDraftByHash(this.connection, txCtx, actor, hash)) ??
                    (await insertBatch(this.connection, txCtx, {
                        uuid: randomUUID(),
                        operationType: type,
                        parameters,
                        createdById: actor,
                        undoOfBatchId,
                        selectionHash: hash,
                        totalCount: targetIds.length,
                    }));
                await upsertPreviewItems(this.connection, txCtx, batch.id, verdicts);
                return batch;
            },
        );
    }

    // Queues once per batch; a repeated call finds the batch already past draft and has no effect.
    async run(ctx: RequestContext, uuid: string): Promise<BulkBatchRow> {
        const { batch, enqueue } = await withAggregateLock(
            this.connection,
            ctx,
            `bulk-batch:${uuid}`,
            async txCtx => {
                const found = await this.ownedBatch(txCtx, uuid);
                if (found.status === 'draft') {
                    await ctxQuery(
                        this.connection,
                        txCtx,
                        `UPDATE bulk_batch SET status = 'queued', "updatedAt" = now() WHERE id = $1`,
                        [found.id],
                    );
                    return { batch: { ...found, status: 'queued' as const }, enqueue: true };
                }
                // A queued batch may have lost its job, a running one its worker (stale); the runner's
                // claim lets exactly one job proceed, so a duplicate enqueue is harmless.
                return { batch: found, enqueue: found.status === 'queued' || found.stale };
            },
        );
        if (enqueue) await this.runQueue.enqueue(ctx, uuid);
        return batch;
    }

    async undo(ctx: RequestContext, uuid: string): Promise<BulkBatchRow> {
        const original = await findBatch(this.connection, ctx, uuid);
        if (!original) throw new UserInputError(`Batch not found: ${uuid}`);
        const executor = this.registry.get(original.operationType);
        this.registry.assertAllowed(ctx, executor);
        if (!['done', 'partial', 'stopped'].includes(original.status)) {
            throw new UserInputError('Only a finished batch can be undone');
        }
        const plan = executor.undoPlan?.(original.parameters) ?? null;
        if (!plan) throw new UserInputError('This operation cannot be undone');
        const undoExecutor = this.registry.get(plan.type);
        this.registry.assertAllowed(ctx, undoExecutor);

        const actor = await this.actorId(ctx);
        const undoBatch = await withAggregateLock(
            this.connection,
            ctx,
            `bulk-undo:${uuid}`,
            async txCtx => {
                const existing = await findUndoOf(this.connection, txCtx, original.id);
                if (existing) return existing;
                const applied = await this.visibleAppliedTargets(txCtx, executor, original.id);
                return this.preview(txCtx, plan.type, plan.parameters, applied, original.id);
            },
        );
        if (undoBatch.createdById !== actor) return undoBatch;
        try {
            return await this.run(ctx, undoBatch.uuid);
        } catch (e) {
            // Another actor queued an undo of the same original first: one non-draft undo per original.
            const existing = await findUndoOf(this.connection, ctx, original.id);
            if (existing && (e as { code?: string }).code === '23505') return existing;
            throw e;
        }
    }

    private async visibleAppliedTargets(
        ctx: RequestContext,
        executor: BulkExecutor,
        batchId: number,
    ): Promise<string[]> {
        const rows = await ctxQuery<Array<{ targetId: string }>>(
            this.connection,
            ctx,
            `SELECT "targetId" FROM bulk_batch_item WHERE "batchId" = $1 AND outcome = 'applied'`,
            [batchId],
        );
        const visible = await executor.visibleTargets(
            ctx,
            rows.map(r => r.targetId),
        );
        return rows.map(r => r.targetId).filter(id => visible.has(id));
    }

    private async inspectAll(
        ctx: RequestContext,
        executor: BulkExecutor,
        targetIds: string[],
        parameters: BulkParameters,
    ): Promise<PreviewItemInput[]> {
        const items: PreviewItemInput[] = [];
        for (const targetId of targetIds) {
            const verdict = await executor.inspect(ctx, targetId, parameters);
            items.push({
                targetId,
                label: verdict.label,
                previewOutcome: verdict.outcome === 'applied' ? 'apply' : 'skip',
                previewReasonCode: verdict.reasonCode,
            });
        }
        return items;
    }

    private async ownedBatch(ctx: RequestContext, uuid: string): Promise<BulkBatchRow> {
        const batch = await findBatch(this.connection, ctx, uuid, true);
        if (!batch) throw new UserInputError(`Batch not found: ${uuid}`);
        this.registry.assertAllowed(ctx, this.registry.get(batch.operationType));
        if (batch.createdById !== (await this.actorId(ctx))) throw new ForbiddenError();
        return batch;
    }

    private actorId(ctx: RequestContext): Promise<string> {
        return actorIdOf(this.administratorService, ctx);
    }
}
