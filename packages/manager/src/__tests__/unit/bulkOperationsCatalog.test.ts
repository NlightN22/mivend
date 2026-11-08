import { describe, expect, it } from 'vitest';
import type { BulkOperationInfo } from '../../api/bulkOperations';
import {
    GROUPING_THRESHOLD,
    filterOperations,
    groupOperations,
    searchable,
} from '../../components/bulk-operations/catalogGroups';
import { canOpenBulkOperations, operationUi } from '../../components/bulk-operations/operationUi';

const op = (i: number, area = 'customers'): BulkOperationInfo => ({
    type: `op-${i}`,
    title: `Operation ${i}`,
    description: `Does thing ${i}`,
    area,
    undoable: false,
});
const many = (n: number): BulkOperationInfo[] =>
    Array.from({ length: n }, (_, i) => op(i, i % 2 ? 'prices' : 'customers'));

describe('bulk catalog', () => {
    it('keeps a short list flat and without search', () => {
        const list = many(GROUPING_THRESHOLD);
        expect(searchable(list)).toBe(false);
        expect(groupOperations(list)).toEqual([{ area: '', operations: list }]);
    });

    it('groups by area, alphabetically, and offers search past the threshold', () => {
        const list = many(GROUPING_THRESHOLD + 1);
        expect(searchable(list)).toBe(true);
        expect(groupOperations(list).map(g => g.area)).toEqual(['customers', 'prices']);
    });

    it('searches title and description, ignoring case and blanks', () => {
        const list = many(3);
        expect(filterOperations(list, '  ').length).toBe(3);
        expect(filterOperations(list, 'OPERATION 1').map(o => o.type)).toEqual(['op-1']);
        expect(filterOperations(list, 'thing 2').map(o => o.type)).toEqual(['op-2']);
    });

    it('opens the menu item only for a holder of an operation permission', () => {
        expect(canOpenBulkOperations(name => name === 'ManageCounterpartyPortalAccess')).toBe(true);
        expect(canOpenBulkOperations(() => false)).toBe(false);
    });

    it('has a wizard for the activation operation and none for an unknown one', () => {
        expect(operationUi('counterparty-portal-access')?.defaultParameters).toEqual({
            action: 'activate',
        });
        expect(operationUi('unknown')).toBeNull();
    });
});
