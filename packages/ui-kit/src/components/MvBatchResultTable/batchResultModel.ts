import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

export type BatchResultMode = 'review' | 'result';

export interface BatchResultRow {
    targetId: string;
    label: string | null;
    // Review rows carry the dry-run verdict (apply/skip), result rows the real outcome.
    outcome: string | null;
    reasonCode: string | null;
    message: string | null;
}

export interface BatchCounters {
    total: number;
    applied: number;
    skipped: number;
    failed: number;
}

export interface RowStatus {
    text: string;
    variant: StatusBadgeVariant;
}

export function rowStatus(row: BatchResultRow, mode: BatchResultMode): RowStatus {
    switch (row.outcome) {
        case 'applied':
            return { text: 'Applied', variant: 'success' };
        case 'apply':
            return { text: 'Will apply', variant: 'success' };
        case 'skipped':
        case 'skip':
            return { text: 'Skipped', variant: 'warning' };
        case 'failed':
            return { text: 'Failed', variant: 'danger' };
        default:
            return { text: mode === 'result' ? 'Pending' : 'Not checked', variant: 'neutral' };
    }
}

// The headline is the friendly reason; the technical message is secondary and may name raw record ids.
export function rowDetail(row: BatchResultRow, reasonLabel?: (code: string) => string): string {
    if (row.reasonCode) return reasonLabel ? reasonLabel(row.reasonCode) : row.reasonCode;
    return row.message ?? '';
}

export function technicalDetail(
    row: BatchResultRow,
    reasonLabel?: (code: string) => string,
): string {
    return row.message && row.message !== rowDetail(row, reasonLabel) ? row.message : '';
}

export function pendingCount(counters: BatchCounters): number {
    return Math.max(0, counters.total - counters.applied - counters.skipped - counters.failed);
}
