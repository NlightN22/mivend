import type { BatchResultRow } from '@mivend/ui-kit';
import type { BulkBatch, BulkBatchItem } from '../../api/bulkOperations';

export function toReviewRows(items: BulkBatchItem[]): BatchResultRow[] {
    return items.map(i => ({
        targetId: i.targetId,
        label: i.label,
        outcome: i.previewOutcome,
        reasonCode: i.previewReasonCode,
        message: null,
    }));
}

export function toResultRows(items: BulkBatchItem[]): BatchResultRow[] {
    return items.map(i => ({
        targetId: i.targetId,
        label: i.label,
        outcome: i.outcome,
        reasonCode: i.reasonCode,
        message: i.message,
    }));
}

export function progressOf(
    batch: Pick<BulkBatch, 'appliedCount' | 'skippedCount' | 'failedCount'>,
): number {
    return batch.appliedCount + batch.skippedCount + batch.failedCount;
}

export function refreshKeyOf(batch: BulkBatch | null): string {
    return batch ? `${batch.uuid}:${batch.status}:${progressOf(batch)}` : '';
}
