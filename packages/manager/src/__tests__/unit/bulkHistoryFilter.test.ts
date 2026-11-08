import { describe, expect, it } from 'vitest';
import { toBatchFilter, type BulkHistoryFilters } from '../../api/bulkHistoryFilter';
import { batchReportCsv, reasonLabel } from '../../api/bulkOperationsReport';
import type { BulkBatch, BulkBatchItem } from '../../api/bulkOperations';

const base: BulkHistoryFilters = { search: '', view: 'all', conditions: [] };

describe('toBatchFilter', () => {
    it('is empty for the blank filters', () => {
        expect(toBatchFilter(base)).toEqual({});
    });

    it('maps the view chip, the number search and select conditions', () => {
        expect(
            toBatchFilter({
                search: ' #12a',
                view: 'partial',
                conditions: [{ columnKey: 'operation', operator: 'eq', value: 'op' }],
            }),
        ).toEqual({ status: 'partial', numberPrefix: '12', operationType: 'op' });
    });

    it('lets a result condition override the chip', () => {
        expect(
            toBatchFilter({
                ...base,
                view: 'done',
                conditions: [{ columnKey: 'result', operator: 'eq', value: 'failed' }],
            }).status,
        ).toBe('failed');
    });

    it('turns date conditions into an inclusive-day range', () => {
        const after = toBatchFilter({
            ...base,
            conditions: [{ columnKey: 'date', operator: 'after', value: '2026-01-31' }],
        });
        expect(after.createdFrom).toBe('2026-02-01');
        const between = toBatchFilter({
            ...base,
            conditions: [
                { columnKey: 'date', operator: 'between', value: ['2026-03-01', '2026-03-31'] },
            ],
        });
        expect(between).toEqual({ createdFrom: '2026-03-01', createdTo: '2026-04-01' });
        const before = toBatchFilter({
            ...base,
            conditions: [{ columnKey: 'date', operator: 'before', value: '2026-03-01' }],
        });
        expect(before.createdTo).toBe('2026-03-01');
    });
});

describe('batch report', () => {
    const batch = { number: '7' } as BulkBatch;
    const item = (extra: Partial<BulkBatchItem>): BulkBatchItem => ({
        targetId: '1',
        label: null,
        previewOutcome: 'apply',
        previewReasonCode: null,
        outcome: 'applied',
        reasonCode: null,
        message: null,
        ...extra,
    });

    it('writes one row per record with a translated reason and quoted cells', () => {
        const csv = batchReportCsv(batch, [
            item({ label: 'Alpha, Ltd' }),
            item({ targetId: '2', outcome: 'skipped', reasonCode: 'no_contact' }),
            item({ targetId: '3', outcome: null }),
        ]).split('\n');
        expect(csv[0]).toBe('Batch,Record,Name,Result,Reason,Message');
        expect(csv[1]).toBe('7,1,"Alpha, Ltd",applied,,');
        expect(csv[2]).toBe('7,2,,skipped,Phone or e-mail is missing,');
        expect(csv[3]).toBe('7,3,,pending,,');
    });

    it('falls back to the raw reason code', () => {
        expect(reasonLabel('something_new')).toBe('something_new');
    });
});
