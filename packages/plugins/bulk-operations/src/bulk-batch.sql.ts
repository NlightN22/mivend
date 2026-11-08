import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { STALE_RUN_MINUTES, type BulkBatchRow, type BulkItemRow } from './types';

type Db = Pick<TransactionalConnection, 'getRepository'>;

export const BATCH_COLUMNS = `b.id, b.uuid, b.number::text AS number, b."operationType", b.parameters, b.status, b."createdById",
    b."undoOfBatchId", b."totalCount", b."appliedCount", b."skippedCount", b."failedCount",
    b."startedAt", b."finishedAt", b."errorMessage", b."createdAt",
    (b.status = 'running' AND b."updatedAt" < now() - make_interval(mins => ${STALE_RUN_MINUTES})) AS stale`;

export async function findBatch(
    db: Db,
    ctx: RequestContext,
    uuid: string,
    forUpdate = false,
): Promise<BulkBatchRow | null> {
    const rows = await ctxQuery<BulkBatchRow[]>(
        db,
        ctx,
        `SELECT ${BATCH_COLUMNS} FROM bulk_batch b WHERE b.uuid = $1 ${forUpdate ? 'FOR UPDATE' : ''}`,
        [uuid],
    );
    return rows[0] ?? null;
}

export async function findBatchById(
    db: Db,
    ctx: RequestContext,
    id: number,
): Promise<BulkBatchRow | null> {
    const rows = await ctxQuery<BulkBatchRow[]>(
        db,
        ctx,
        `SELECT ${BATCH_COLUMNS} FROM bulk_batch b WHERE b.id = $1`,
        [id],
    );
    return rows[0] ?? null;
}

export async function findUndoOf(
    db: Db,
    ctx: RequestContext,
    batchId: number,
): Promise<BulkBatchRow | null> {
    const rows = await ctxQuery<BulkBatchRow[]>(
        db,
        ctx,
        `SELECT ${BATCH_COLUMNS} FROM bulk_batch b WHERE b."undoOfBatchId" = $1 AND b.status <> 'draft'`,
        [batchId],
    );
    return rows[0] ?? null;
}

export async function findDraftByHash(
    db: Db,
    ctx: RequestContext,
    createdById: string,
    selectionHash: string,
): Promise<BulkBatchRow | null> {
    const rows = await ctxQuery<BulkBatchRow[]>(
        db,
        ctx,
        `SELECT ${BATCH_COLUMNS} FROM bulk_batch b
         WHERE b."createdById" = $1 AND b."selectionHash" = $2 AND b.status = 'draft'`,
        [createdById, selectionHash],
    );
    return rows[0] ?? null;
}

export async function insertBatch(
    db: Db,
    ctx: RequestContext,
    input: {
        uuid: string;
        operationType: string;
        parameters: Record<string, unknown>;
        createdById: string;
        undoOfBatchId: number | null;
        selectionHash: string;
        totalCount: number;
    },
): Promise<BulkBatchRow> {
    const rows = await ctxQuery<BulkBatchRow[]>(
        db,
        ctx,
        `INSERT INTO bulk_batch AS b (uuid, "operationType", parameters, status, "createdById",
            "undoOfBatchId", "selectionHash", "totalCount")
         VALUES ($1, $2, $3::jsonb, 'draft', $4, $5, $6, $7)
         RETURNING ${BATCH_COLUMNS}`,
        [
            input.uuid,
            input.operationType,
            JSON.stringify(input.parameters),
            input.createdById,
            input.undoOfBatchId,
            input.selectionHash,
            input.totalCount,
        ],
    );
    return rows[0];
}

export interface PreviewItemInput {
    targetId: string;
    label: string | null;
    previewOutcome: string;
    previewReasonCode: string | null;
}

// Re-previewing the same draft replaces its verdicts in place; nothing is applied here.
export async function upsertPreviewItems(
    db: Db,
    ctx: RequestContext,
    batchId: number,
    items: PreviewItemInput[],
): Promise<void> {
    await ctxQuery(
        db,
        ctx,
        `INSERT INTO bulk_batch_item ("batchId", "targetId", label, "previewOutcome", "previewReasonCode")
         SELECT $1, t.target, t.label, t.outcome, t.reason
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS t(target, label, outcome, reason)
         ON CONFLICT ("batchId", "targetId") DO UPDATE SET label = EXCLUDED.label,
            "previewOutcome" = EXCLUDED."previewOutcome",
            "previewReasonCode" = EXCLUDED."previewReasonCode", "updatedAt" = now()`,
        [
            batchId,
            items.map(i => i.targetId),
            items.map(i => i.label),
            items.map(i => i.previewOutcome),
            items.map(i => i.previewReasonCode),
        ],
    );
}

export function pendingItems(
    db: Db,
    ctx: RequestContext,
    batchId: number,
    limit: number,
): Promise<BulkItemRow[]> {
    return ctxQuery<BulkItemRow[]>(
        db,
        ctx,
        `SELECT id, "batchId", "targetId", label, "previewOutcome", "previewReasonCode", outcome,
            "reasonCode", message FROM bulk_batch_item
         WHERE "batchId" = $1 AND outcome IS NULL ORDER BY id LIMIT $2`,
        [batchId, limit],
    );
}

export async function recordOutcome(
    db: Db,
    ctx: RequestContext,
    itemId: number,
    result: {
        outcome: string;
        reasonCode: string | null;
        message: string | null;
        label: string | null;
    },
): Promise<void> {
    await ctxQuery(
        db,
        ctx,
        `UPDATE bulk_batch_item SET outcome = $2, "reasonCode" = $3, message = $4,
            label = COALESCE($5, label), "updatedAt" = now() WHERE id = $1`,
        [itemId, result.outcome, result.reasonCode, result.message, result.label],
    );
}

export async function refreshCounters(db: Db, ctx: RequestContext, batchId: number): Promise<void> {
    await ctxQuery(
        db,
        ctx,
        `UPDATE bulk_batch SET
            "appliedCount" = (SELECT count(*) FROM bulk_batch_item WHERE "batchId" = $1 AND outcome = 'applied'),
            "skippedCount" = (SELECT count(*) FROM bulk_batch_item WHERE "batchId" = $1 AND outcome = 'skipped'),
            "failedCount" = (SELECT count(*) FROM bulk_batch_item WHERE "batchId" = $1 AND outcome = 'failed'),
            "updatedAt" = now()
         WHERE id = $1`,
        [batchId],
    );
}

// Reads the live rights, not the session snapshot that was serialized when the job was queued.
export async function actorHoldsPermission(
    db: Db,
    ctx: RequestContext,
    administratorId: string,
    permission: string,
): Promise<boolean> {
    // Same channel as ctx.userHasPermissions: only roles assigned to the job's channel count.
    const rows = await ctxQuery<Array<{ ok: number }>>(
        db,
        ctx,
        `SELECT 1 AS ok FROM administrator a
         JOIN "user" u ON u.id = a."userId"
         JOIN user_roles_role ur ON ur."userId" = u.id
         JOIN role r ON r.id = ur."roleId"
         JOIN role_channels_channel rc ON rc."roleId" = r.id AND rc."channelId"::text = $3
         WHERE a.id::text = $1 AND a."deletedAt" IS NULL AND u."deletedAt" IS NULL
           AND $2 = ANY(string_to_array(r.permissions, ',')) LIMIT 1`,
        [administratorId, permission, String(ctx.channelId)],
    );
    return rows.length > 0;
}

export async function skipPending(
    db: Db,
    ctx: RequestContext,
    batchId: number,
    reasonCode: string,
    message: string,
): Promise<number> {
    const rows = await ctxQuery<Array<{ n: number }>>(
        db,
        ctx,
        `WITH u AS (
             UPDATE bulk_batch_item SET outcome = 'skipped', "reasonCode" = $2, message = $3, "updatedAt" = now()
             WHERE "batchId" = $1 AND outcome IS NULL RETURNING 1)
         SELECT count(*)::int AS n FROM u`,
        [batchId, reasonCode, message],
    );
    return rows[0].n;
}
