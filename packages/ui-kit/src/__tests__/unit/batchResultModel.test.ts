import { describe, expect, it } from 'vitest';

import {
    pendingCount,
    rowDetail,
    rowStatus,
    technicalDetail,
    type BatchResultRow,
} from '../../components/MvBatchResultTable/batchResultModel';

const row = (outcome: string | null, extra: Partial<BatchResultRow> = {}): BatchResultRow => ({
    targetId: '1',
    label: null,
    outcome,
    reasonCode: null,
    message: null,
    ...extra,
});

describe('batch result model', () => {
    it.each([
        ['applied', 'result', 'Applied', 'success'],
        ['apply', 'review', 'Will apply', 'success'],
        ['skipped', 'result', 'Skipped', 'warning'],
        ['skip', 'review', 'Skipped', 'warning'],
        ['failed', 'result', 'Failed', 'danger'],
        [null, 'result', 'Pending', 'neutral'],
        [null, 'review', 'Not checked', 'neutral'],
    ] as const)('maps %s in %s mode', (outcome, mode, text, variant) => {
        expect(rowStatus(row(outcome), mode)).toEqual({ text, variant });
    });

    it('headlines the friendly reason and keeps the technical message secondary', () => {
        const failed = row('failed', { message: 'Counterparty 7 boom', reasonCode: 'error' });
        expect(rowDetail(failed, () => 'Could not be applied')).toBe('Could not be applied');
        expect(technicalDetail(failed, () => 'Could not be applied')).toBe('Counterparty 7 boom');
        expect(rowDetail(row('skipped', { reasonCode: 'x' }))).toBe('x');
        expect(technicalDetail(row('skipped', { reasonCode: 'x', message: 'x' }))).toBe('');
        expect(rowDetail(row('failed', { message: 'only message' }))).toBe('only message');
        expect(rowDetail(row('applied'))).toBe('');
    });

    it('counts the records the runner has not reached', () => {
        expect(pendingCount({ total: 10, applied: 4, skipped: 2, failed: 1 })).toBe(3);
        expect(pendingCount({ total: 1, applied: 2, skipped: 0, failed: 0 })).toBe(0);
    });
});
