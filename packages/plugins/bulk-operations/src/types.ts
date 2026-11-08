export const loggerCtx = 'BulkOperations';
export const BULK_RUN_QUEUE = 'bulk-batch-run';
export const MAX_SELECTION = 1000;
export const RUN_CHUNK = 25;
export const MAX_TAKE = 100;

export type BulkBatchStatus = 'draft' | 'queued' | 'running' | 'done' | 'partial' | 'failed';
export type BulkItemOutcome = 'applied' | 'skipped' | 'failed';

export interface BulkBatchRow {
    id: number;
    uuid: string;
    number: string;
    operationType: string;
    parameters: Record<string, unknown>;
    status: BulkBatchStatus;
    createdById: string;
    undoOfBatchId: number | null;
    totalCount: number;
    appliedCount: number;
    skippedCount: number;
    failedCount: number;
    startedAt: Date | null;
    finishedAt: Date | null;
    errorMessage: string | null;
    createdAt: Date;
}

export interface BulkItemRow {
    id: number;
    batchId: number;
    targetId: string;
    label: string | null;
    previewOutcome: string;
    previewReasonCode: string | null;
    outcome: BulkItemOutcome | null;
    reasonCode: string | null;
    message: string | null;
}

export function clampTake(take: number | null | undefined, fallback: number): number {
    return Math.min(Math.max(take ?? fallback, 1), MAX_TAKE);
}

export function clampSkip(skip: number | null | undefined): number {
    return Math.max(skip ?? 0, 0);
}
