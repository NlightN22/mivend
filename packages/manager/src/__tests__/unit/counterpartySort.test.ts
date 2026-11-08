import { describe, it, expect } from 'vitest';
import { buildActivationColumns } from '../../components/bulk-operations/activationColumns';
import {
    DEFAULT_ACTIVATION_SORT,
    sortFromState,
    sortParameter,
    sortToState,
} from '../../components/bulk-operations/counterpartySort';

// The server sort key is the column's sortField, never the display field: they only coincide for some columns.
// A key outside CounterpartySortParameter fails GraphQL validation and blanks the whole table.
const COLUMNS = buildActivationColumns([]);

describe('activation sort mapping', () => {
    it('maps a column whose field differs from its sortField to the real server key', () => {
        const sort = sortFromState([{ field: 'manager', order: -1 }], COLUMNS);
        expect(sort).toEqual({ field: 'managerErpId', dir: 'DESC' });
        expect(sortParameter(sort)).toEqual({ managerErpId: 'DESC' });
    });

    it('maps a column whose field equals its sortField, ASC for order 1', () => {
        expect(sortFromState([{ field: 'shortName', order: 1 }], COLUMNS)).toEqual({
            field: 'shortName',
            dir: 'ASC',
        });
    });

    it('falls back to the default for no sort or an unsortable column', () => {
        expect(sortFromState([], COLUMNS)).toEqual(DEFAULT_ACTIVATION_SORT);
        expect(sortFromState([{ field: 'branch', order: 1 }], COLUMNS)).toEqual(
            DEFAULT_ACTIVATION_SORT,
        );
    });

    it('turns a server sort back into the column state', () => {
        expect(sortToState({ field: 'managerErpId', dir: 'ASC' }, COLUMNS)).toEqual([
            { field: 'manager', order: 1 },
        ]);
    });
});
