import { describe, it, expect } from 'vitest';
import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { mapSortToApi } from '../../components/bulk-operations/counterpartySort';

// Key must be sortField, never the display field: they only coincide for some columns.
// A field not in CounterpartySortParameter fails GraphQL validation and blanks the whole table.

const COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'shortName',
        header: 'Company name',
        width: 220,
        sortField: 'shortName',
        filterConfig: { type: 'none' },
    },
    {
        field: 'manager',
        header: 'Manager',
        width: 160,
        sortField: 'managerErpId',
        filterConfig: { type: 'none' },
    },
    { field: 'branch', header: 'Branch', width: 140, filterConfig: { type: 'none' } },
];

describe('mapSortToApi', () => {
    it('maps a column with field !== sortField to its real backend sortField (the regression this guards)', () => {
        const result = mapSortToApi([{ field: 'manager', order: -1 }], COLUMNS);
        expect(result).toEqual({ managerErpId: 'DESC' });
        expect(result).not.toHaveProperty('manager');
    });

    it('maps a column whose field happens to equal its sortField correctly too', () => {
        const result = mapSortToApi([{ field: 'shortName', order: 1 }], COLUMNS);
        expect(result).toEqual({ shortName: 'ASC' });
    });

    it('returns an empty object when nothing is sorted', () => {
        expect(mapSortToApi([], COLUMNS)).toEqual({});
    });

    it('returns an empty object for a column with no sortField, rather than sending an invalid key', () => {
        const result = mapSortToApi([{ field: 'branch', order: 1 }], COLUMNS);
        expect(result).toEqual({});
    });

    it('maps order -1 to DESC and order 1 to ASC', () => {
        expect(mapSortToApi([{ field: 'shortName', order: -1 }], COLUMNS)).toEqual({
            shortName: 'DESC',
        });
        expect(mapSortToApi([{ field: 'shortName', order: 1 }], COLUMNS)).toEqual({
            shortName: 'ASC',
        });
    });
});
