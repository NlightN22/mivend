import type { BulkExecutor } from './bulk-executor';
import type { ScopedBatch } from './bulk-batch-query.service';
import type { BulkBatchRow } from './types';

export interface BulkBatchDto {
    uuid: string;
    number: string;
    operationType: string;
    parameters: Record<string, unknown>;
    status: string;
    createdById: string;
    createdByName: string | null;
    undoOfUuid: string | null;
    totalCount: number;
    appliedCount: number;
    skippedCount: number;
    failedCount: number;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    errorMessage: string | null;
    undoable: boolean;
}

export function toBulkBatch(
    batch: ScopedBatch | BulkBatchRow,
    executor: BulkExecutor,
): BulkBatchDto {
    const scoped = 'visibleCount' in batch ? batch : null;
    return {
        uuid: batch.uuid,
        number: batch.number,
        operationType: batch.operationType,
        parameters: batch.parameters,
        status: batch.status,
        createdById: batch.createdById,
        createdByName: scoped?.createdByName ?? null,
        undoOfUuid: scoped?.undoOfUuid ?? null,
        totalCount: scoped ? scoped.visibleCount : batch.totalCount,
        appliedCount: scoped ? scoped.visibleApplied : batch.appliedCount,
        skippedCount: scoped ? scoped.visibleSkipped : batch.skippedCount,
        failedCount: scoped ? scoped.visibleFailed : batch.failedCount,
        startedAt: batch.startedAt,
        finishedAt: batch.finishedAt,
        createdAt: batch.createdAt,
        errorMessage: batch.errorMessage,
        undoable: executor.undoPlan?.(batch.parameters) != null,
    };
}
