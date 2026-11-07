import { describe, it, expect } from 'vitest';
import {
    parseTableViewState,
    sameTableViewState,
    toStoredView,
    visibleColumnsOf,
    type TableViewState,
} from '../../composables/tableViewState';

const STATE: TableViewState = {
    filters: { search: '1001', view: 'overdue', state: ['Shipped'] },
    sort: { field: 'totalWithTax', dir: 'ASC' },
    columnOrder: ['code', 'date', 'state'],
    hiddenColumns: ['date'],
};

describe('table view state', () => {
    it('round-trips through JSON', () => {
        expect(parseTableViewState(JSON.stringify(STATE))).toEqual(STATE);
    });

    it.each([
        ['corrupt JSON', '{oops'],
        ['a non-object', '7'],
        ['missing sort', JSON.stringify({ ...STATE, sort: undefined })],
        ['bad sort direction', JSON.stringify({ ...STATE, sort: { field: 'code', dir: 'UP' } })],
        ['non-string columns', JSON.stringify({ ...STATE, columnOrder: [1] })],
    ])('rejects %s', (_label, json) => {
        expect(parseTableViewState(json)).toBeNull();
    });

    it('drops a stored view whose shape no longer parses', () => {
        const bad = { id: '1', name: 'old', filters: '{"state":"X"}', visibleColumns: [] };
        expect(toStoredView(bad)).toBeNull();
    });

    it('compares states regardless of key order', () => {
        const shuffled: TableViewState = {
            ...STATE,
            filters: { state: ['Shipped'], view: 'overdue', search: '1001' },
        };
        expect(sameTableViewState(STATE, shuffled)).toBe(true);
        expect(sameTableViewState(STATE, { ...STATE, hiddenColumns: [] })).toBe(false);
    });

    it('lists visible columns in the stored order', () => {
        expect(visibleColumnsOf(STATE)).toEqual(['code', 'state']);
    });
});
