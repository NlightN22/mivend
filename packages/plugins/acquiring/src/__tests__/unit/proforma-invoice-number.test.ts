import { describe, expect, it } from 'vitest';

import { addDays, parseProformaNumber } from '../../proforma-invoice-number';
import { applyStatusFilter, displayStatusOf } from '../../proforma-invoice-display';

describe('parseProformaNumber', () => {
    it('splits the document id, ordinal and version', () => {
        expect(parseProformaNumber('1000000303-01-2')).toEqual({
            documentId: '1000000303-01',
            ordinal: 1,
            version: 2,
        });
        expect(parseProformaNumber('1000000303-12-10')?.ordinal).toBe(12);
    });

    it('rejects the unversioned legacy shape', () => {
        expect(parseProformaNumber('1000000303-01')).toBeNull();
    });
});

describe('addDays', () => {
    it('adds whole days to the issue date', () => {
        expect(addDays(new Date('2026-10-13T10:00:00Z'), 3).toISOString()).toBe(
            '2026-10-16T10:00:00.000Z',
        );
    });
});

describe('displayStatusOf', () => {
    it('never exposes paid: stored paid, pending and issued are current', () => {
        expect(displayStatusOf('paid')).toBe('current');
        expect(displayStatusOf('pending')).toBe('current');
        expect(displayStatusOf('issued')).toBe('current');
        expect(displayStatusOf('superseded')).toBe('superseded');
        expect(displayStatusOf('cancelled')).toBe('cancelled');
    });
});

describe('applyStatusFilter', () => {
    it('maps current to the stored statuses and passes others through', () => {
        const calls: unknown[][] = [];
        const qb = { andWhere: (...a: unknown[]) => calls.push(a) } as never;
        applyStatusFilter(qb, 'p', 'current');
        applyStatusFilter(qb, 'p', 'cancelled');
        expect(calls[0][1]).toEqual({ currentStatuses: ['pending', 'issued', 'paid'] });
        expect(calls[1][1]).toEqual({ status: 'cancelled' });
    });
});
