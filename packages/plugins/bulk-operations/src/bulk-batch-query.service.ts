import { Injectable } from '@nestjs/common';
import {
    AdministratorService,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { ctxQuery } from 'shared';

import { actorIdOf } from './actor-id';
import { BulkExecutorRegistry } from './bulk-executor-registry';
import { BATCH_COLUMNS, findBatch } from './bulk-batch.sql';
import { buildBatchWhere, SORT_COLUMNS, type BatchListOptions } from './bulk-batch-list-filter';
import { clampSkip, clampTake, type BulkBatchRow, type BulkItemRow } from './types';

interface Extras {
    undoOfUuid: string | null;
    createdByName: string | null;
}

const NAME_SQL = `NULLIF(concat_ws(' ', a."firstName", a."lastName"), '')`;

export interface ScopedBatch extends BulkBatchRow {
    visibleCount: number;
    visibleApplied: number;
    visibleSkipped: number;
    visibleFailed: number;
    undoOfUuid: string | null;
    createdByName: string | null;
}

export interface ItemListOptions {
    take?: number | null;
    skip?: number | null;
    outcome?: string | null;
}

@Injectable()
export class BulkBatchQueryService {
    constructor(
        private connection: TransactionalConnection,
        private registry: BulkExecutorRegistry,
        private administratorService: AdministratorService,
    ) {}

    async list(
        ctx: RequestContext,
        options: BatchListOptions = {},
    ): Promise<{ items: ScopedBatch[]; totalItems: number }> {
        const types = this.registry.allowed(ctx).map(e => e.type);
        if (types.length === 0) return { items: [], totalItems: 0 };
        const where = buildBatchWhere(types, options);
        const order = SORT_COLUMNS[options.sort?.field ?? 'createdAt'] ?? SORT_COLUMNS.createdAt;
        const direction = options.sort?.direction === 'ASC' ? 'ASC' : 'DESC';
        const take = clampTake(options.take, 20);
        const skip = clampSkip(options.skip);
        const [{ count }] = await ctxQuery<Array<{ count: string }>>(
            this.connection,
            ctx,
            `SELECT count(*) FROM bulk_batch b WHERE ${where.sql}`,
            where.params,
        );
        const rows = await ctxQuery<Array<BulkBatchRow & Extras>>(
            this.connection,
            ctx,
            `SELECT ${BATCH_COLUMNS}, u.uuid AS "undoOfUuid", ${NAME_SQL} AS "createdByName" FROM bulk_batch b
             LEFT JOIN bulk_batch u ON u.id = b."undoOfBatchId"
             LEFT JOIN administrator a ON a.id::text = b."createdById"
             WHERE ${where.sql} ORDER BY ${order} ${direction}, b.id DESC
             LIMIT ${take} OFFSET ${skip}`,
            where.params,
        );
        return { items: await this.scoped(ctx, rows), totalItems: Number(count) };
    }

    async get(ctx: RequestContext, uuid: string): Promise<ScopedBatch> {
        const batch = await this.readable(ctx, uuid);
        const [one] = await this.scoped(ctx, [{ ...batch, ...(await this.extras(ctx, batch)) }]);
        return one;
    }

    async items(
        ctx: RequestContext,
        uuid: string,
        options: ItemListOptions = {},
    ): Promise<{ items: BulkItemRow[]; totalItems: number }> {
        const batch = await this.readable(ctx, uuid);
        const executor = this.registry.get(batch.operationType);
        const all = await this.allTargets(ctx, batch.id);
        const visible = [...(await executor.visibleTargets(ctx, all))];
        const outcome = options.outcome ?? null;
        const params = [batch.id, visible, outcome];
        const filter = `"batchId" = $1 AND "targetId" = ANY($2::text[])
            AND ($3::text IS NULL OR COALESCE(outcome, 'pending') = $3)`;
        const [{ count }] = await ctxQuery<Array<{ count: string }>>(
            this.connection,
            ctx,
            `SELECT count(*) FROM bulk_batch_item WHERE ${filter}`,
            params,
        );
        const items = await ctxQuery<BulkItemRow[]>(
            this.connection,
            ctx,
            `SELECT id, "batchId", "targetId", label, "previewOutcome", "previewReasonCode", outcome,
                "reasonCode", message FROM bulk_batch_item WHERE ${filter}
             ORDER BY id LIMIT ${clampTake(options.take, 50)} OFFSET ${clampSkip(options.skip)}`,
            params,
        );
        return { items, totalItems: Number(count) };
    }

    private async readable(ctx: RequestContext, uuid: string): Promise<BulkBatchRow> {
        const batch = await findBatch(this.connection, ctx, uuid);
        if (!batch) throw new UserInputError(`Batch not found: ${uuid}`);
        this.registry.assertAllowed(ctx, this.registry.get(batch.operationType));
        // A draft is its creator's working copy; it is not part of the shared history.
        if (
            batch.status === 'draft' &&
            batch.createdById !== (await actorIdOf(this.administratorService, ctx))
        ) {
            throw new ForbiddenError();
        }
        return batch;
    }

    private async extras(ctx: RequestContext, batch: BulkBatchRow): Promise<Extras> {
        const rows = await ctxQuery<Extras[]>(
            this.connection,
            ctx,
            `SELECT (SELECT uuid FROM bulk_batch WHERE id = $1) AS "undoOfUuid",
                (SELECT ${NAME_SQL} FROM administrator a WHERE a.id::text = $2) AS "createdByName"`,
            [batch.undoOfBatchId, batch.createdById],
        );
        return rows[0];
    }

    private async allTargets(ctx: RequestContext, batchId: number): Promise<string[]> {
        const rows = await ctxQuery<Array<{ targetId: string }>>(
            this.connection,
            ctx,
            `SELECT "targetId" FROM bulk_batch_item WHERE "batchId" = $1`,
            [batchId],
        );
        return rows.map(r => r.targetId);
    }

    // Counters are recounted over the records the viewer may see, never the stored totals.
    private async scoped(
        ctx: RequestContext,
        rows: Array<BulkBatchRow & Extras>,
    ): Promise<ScopedBatch[]> {
        if (rows.length === 0) return [];
        const items = await ctxQuery<
            Array<{ batchId: number; targetId: string; outcome: string | null }>
        >(
            this.connection,
            ctx,
            `SELECT "batchId", "targetId", outcome FROM bulk_batch_item WHERE "batchId" = ANY($1::int[])`,
            [rows.map(r => r.id)],
        );
        const visibleByType = new Map<string, Set<string>>();
        for (const type of new Set(rows.map(r => r.operationType))) {
            const ids = items
                .filter(i => rows.find(r => r.id === i.batchId)?.operationType === type)
                .map(i => i.targetId);
            visibleByType.set(type, await this.registry.get(type).visibleTargets(ctx, ids));
        }
        return rows.map(row => {
            const visible = visibleByType.get(row.operationType) ?? new Set<string>();
            const mine = items.filter(i => i.batchId === row.id && visible.has(i.targetId));
            const count = (outcome: string): number =>
                mine.filter(i => i.outcome === outcome).length;
            return {
                ...row,
                visibleCount: mine.length,
                visibleApplied: count('applied'),
                visibleSkipped: count('skipped'),
                visibleFailed: count('failed'),
            };
        });
    }
}
