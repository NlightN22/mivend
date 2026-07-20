import { describe, it, expect } from 'vitest';
import {
    normalizeDataTableState,
    type DataTableState,
    type UseDataTableStateOptions,
} from '../../composables/useDataTableState';

interface Filters {
    [key: string]: unknown;
    status: string;
    code: string;
}

const OPTIONS: UseDataTableStateOptions = {
    columns: [
        { field: 'code', width: 100, required: true, sortField: 'code' },
        { field: 'status', width: 80 },
        { field: 'newColumn', width: 60 },
    ],
    allowedFilterKeys: ['status', 'code'],
};

const DEFAULTS: DataTableState<Filters> = {
    columnOrder: ['code', 'status', 'newColumn'],
    columnWidths: { code: 100, status: 80, newColumn: 60 },
    hiddenColumns: [],
    sort: [{ field: 'code', order: -1 }],
    filters: { status: '', code: '' },
    pageSize: 20,
};

describe('normalizeDataTableState', () => {
    it('falls back to defaults wholesale when saved state is not a plain object', () => {
        expect(normalizeDataTableState(null, DEFAULTS, OPTIONS)).toEqual(DEFAULTS);
        expect(normalizeDataTableState('garbage', DEFAULTS, OPTIONS)).toEqual(DEFAULTS);
        expect(normalizeDataTableState([1, 2, 3], DEFAULTS, OPTIONS)).toEqual(DEFAULTS);
    });

    it('drops an obsolete column from hiddenColumns/columnOrder/columnWidths', () => {
        const saved = {
            columnOrder: ['status', 'oldRemovedColumn', 'code'],
            columnWidths: { status: 80, oldRemovedColumn: 999, code: 100 },
            hiddenColumns: ['oldRemovedColumn'],
            sort: [],
            filters: {},
            pageSize: 20,
        };
        const result = normalizeDataTableState(saved, DEFAULTS, OPTIONS);
        expect(result.columnOrder).not.toContain('oldRemovedColumn');
        expect(result.columnWidths).not.toHaveProperty('oldRemovedColumn');
        expect(result.hiddenColumns).not.toContain('oldRemovedColumn');
    });

    it('appends a new column (present in config, missing from saved order) at the end', () => {
        const saved = {
            columnOrder: ['status', 'code'],
            columnWidths: { status: 80, code: 100 },
            hiddenColumns: [],
            sort: [],
            filters: {},
            pageSize: 20,
        };
        const result = normalizeDataTableState(saved, DEFAULTS, OPTIONS);
        expect(result.columnOrder).toEqual(['status', 'code', 'newColumn']);
    });

    it('never lets a required column stay hidden, even if persisted as hidden', () => {
        const saved = {
            columnOrder: DEFAULTS.columnOrder,
            columnWidths: DEFAULTS.columnWidths,
            hiddenColumns: ['code', 'status'],
            sort: [],
            filters: {},
            pageSize: 20,
        };
        const result = normalizeDataTableState(saved, DEFAULTS, OPTIONS);
        expect(result.hiddenColumns).not.toContain('code');
        expect(result.hiddenColumns).toContain('status');
    });

    it('preserves column order/width for still-existing columns', () => {
        const saved = {
            columnOrder: ['status', 'code', 'newColumn'],
            columnWidths: { status: 250, code: 340, newColumn: 60 },
            hiddenColumns: [],
            sort: [],
            filters: {},
            pageSize: 20,
        };
        const result = normalizeDataTableState(saved, DEFAULTS, OPTIONS);
        expect(result.columnOrder).toEqual(['status', 'code', 'newColumn']);
        expect(result.columnWidths).toEqual({ status: 250, code: 340, newColumn: 60 });
    });

    it('drops a sort entry referencing a field with no sortField in the current config', () => {
        const saved = {
            columnOrder: DEFAULTS.columnOrder,
            columnWidths: DEFAULTS.columnWidths,
            hiddenColumns: [],
            sort: [{ field: 'status', order: 1 }],
            filters: {},
            pageSize: 20,
        };
        const result = normalizeDataTableState(saved, DEFAULTS, OPTIONS);
        expect(result.sort).toEqual([]);
    });

    it('keeps a sort entry for a column that still declares sortField', () => {
        const saved = {
            columnOrder: DEFAULTS.columnOrder,
            columnWidths: DEFAULTS.columnWidths,
            hiddenColumns: [],
            sort: [{ field: 'code', order: 1 }],
            filters: {},
            pageSize: 20,
        };
        const result = normalizeDataTableState(saved, DEFAULTS, OPTIONS);
        expect(result.sort).toEqual([{ field: 'code', order: 1 }]);
    });

    it('drops an unknown/renamed saved filter key instead of crashing', () => {
        const saved = {
            columnOrder: DEFAULTS.columnOrder,
            columnWidths: DEFAULTS.columnWidths,
            hiddenColumns: [],
            sort: [],
            filters: { status: 'pending', oldRenamedFilter: { min: 5, max: 10 } },
            pageSize: 20,
        };
        const result = normalizeDataTableState(saved, DEFAULTS, OPTIONS);
        expect(result.filters).toEqual({ status: 'pending', code: '' });
        expect(result.filters).not.toHaveProperty('oldRenamedFilter');
    });

    it('preserves a filter declared by a column but absent from defaultFilters', () => {
        const optionsWithExtraFilter: UseDataTableStateOptions = {
            ...OPTIONS,
            allowedFilterKeys: ['status', 'code', 'extraFilterWithNoDefault'],
        };
        const saved = {
            columnOrder: DEFAULTS.columnOrder,
            columnWidths: DEFAULTS.columnWidths,
            hiddenColumns: [],
            sort: [],
            filters: { extraFilterWithNoDefault: 'kept' },
            pageSize: 20,
        };
        const result = normalizeDataTableState(saved, DEFAULTS, optionsWithExtraFilter);
        expect((result.filters as Record<string, unknown>).extraFilterWithNoDefault).toBe('kept');
    });

    it('falls back to defaults.pageSize for a missing/invalid saved pageSize', () => {
        const saved = { ...DEFAULTS, pageSize: -5 };
        const result = normalizeDataTableState(saved, DEFAULTS, OPTIONS);
        expect(result.pageSize).toBe(20);
    });

    it('always seeds an externally-owned pageSize from defaults, ignoring a valid saved value', () => {
        const saved = { ...DEFAULTS, pageSize: 50 };
        const result = normalizeDataTableState(
            saved,
            { ...DEFAULTS, pageSize: 20 },
            {
                ...OPTIONS,
                externallyOwned: { pageSize: true },
            },
        );
        expect(result.pageSize).toBe(20);
    });

    it("always seeds externally-owned filter keys from defaults, ignoring a valid saved value — real incident: a stale persisted `status`/pageSize desynced from a parent tab's own fresh-mount fetch, producing a table whose displayed page disagreed with what was actually fetched", () => {
        const saved = {
            ...DEFAULTS,
            filters: { status: 'issued', code: 'stale-code' },
        };
        const defaultsWithLiveValues: DataTableState<Filters> = {
            ...DEFAULTS,
            filters: { status: '', code: '' },
        };
        const result = normalizeDataTableState(saved, defaultsWithLiveValues, {
            ...OPTIONS,
            externallyOwned: { filterKeys: ['status'] },
        });
        expect((result.filters as Filters).status).toBe('');
        // Not declared as externally-owned — still restores from the saved value normally.
        expect((result.filters as Filters).code).toBe('stale-code');
    });
});
