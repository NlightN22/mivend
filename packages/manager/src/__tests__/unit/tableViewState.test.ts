import { describe, it, expect } from 'vitest';
import {
    BUILT_IN_CHOICE,
    initialViewId,
    parseTableViewState,
    sameTableViewState,
    toStoredView,
    visibleColumnsOf,
    type StoredTableView,
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
        const bad = {
            id: '1',
            name: 'old',
            filters: '{"state":"X"}',
            visibleColumns: [],
            scope: 'PERSONAL' as const,
            isDefault: false,
        };
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

    it('maps a team view with its default marker', () => {
        const row = {
            id: '2',
            name: 'Team',
            filters: JSON.stringify(STATE),
            visibleColumns: [],
            scope: 'SHARED' as const,
            isDefault: true,
        };
        expect(toStoredView(row)).toMatchObject({ shared: true, isDefault: true });
    });
});

describe('initialViewId', () => {
    const mk = (id: string, isDefault = false): StoredTableView => ({
        id,
        name: id,
        shared: isDefault,
        isDefault,
        state: STATE,
    });
    const views = [mk('1'), mk('2', true)];

    it('prefers the remembered choice over the team default', () => {
        expect(initialViewId(views, '1')).toBe('1');
    });

    it('falls back to the team default when nothing valid is remembered', () => {
        expect(initialViewId(views, '')).toBe('2');
        expect(initialViewId(views, '404')).toBe('2');
    });

    it('keeps the explicit built-in choice even when a team default exists', () => {
        expect(initialViewId(views, BUILT_IN_CHOICE)).toBe('');
    });

    it('is the built-in view when there is neither a choice nor a default', () => {
        expect(initialViewId([mk('1')], '')).toBe('');
    });
});
