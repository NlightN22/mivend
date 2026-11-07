import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

const api = vi.hoisted(() => ({
    fetchTableViews: vi.fn(),
    saveTableView: vi.fn(),
    updateTableView: vi.fn(),
    setTableViewDefault: vi.fn(),
    deleteTableView: vi.fn(),
}));
vi.mock('../../api/tableViews', () => api);

import { useTableViews, type TableViews } from '../../composables/useTableViews';
import type { TableViewState } from '../../composables/tableViewState';

const STATE: TableViewState = {
    filters: { search: '', view: 'overdue', conditions: [] },
    sort: { field: 'createdAt', dir: 'DESC' },
    columnOrder: ['code', 'date'],
    hiddenColumns: ['date'],
};
const row = (
    id: string,
    name: string,
    shared = false,
    isDefault = false,
): Record<string, unknown> => ({
    id,
    name,
    filters: JSON.stringify(STATE),
    visibleColumns: [],
    scope: shared ? 'SHARED' : 'PERSONAL',
    isDefault,
});

const store = new Map<string, string>();
const state = shallowRef<TableViewState>(STATE);
const apply = vi.fn((s: TableViewState) => {
    state.value = s;
});

function setup(skipRestore = false): TableViews {
    return useTableViews({
        viewsKey: 'orders',
        ownerKey: 'admin-1',
        capture: () => state.value,
        apply,
        skipRestore: () => skipRestore,
    });
}

beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    state.value = { ...STATE, filters: { search: '', view: 'all', conditions: [] } };
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
    });
    api.fetchTableViews.mockResolvedValue([row('7', 'Overdue')]);
    api.updateTableView.mockResolvedValue({ id: '7' });
    api.setTableViewDefault.mockResolvedValue({ id: '8' });
    api.saveTableView.mockResolvedValue({ id: '9' });
    api.deleteTableView.mockResolvedValue(true);
});

describe('useTableViews', () => {
    it('saves the captured state with the visible columns and selects the new view', async () => {
        const v = setup();
        await v.create('Mine');
        expect(api.saveTableView).toHaveBeenCalledWith(
            'orders',
            'Mine',
            JSON.stringify(state.value),
            ['code'],
            'PERSONAL',
        );
        expect(v.activeId.value).toBe('9');
    });

    it('saves a team view when asked to', async () => {
        const v = setup();
        await v.create('Team', 'SHARED');
        expect(api.saveTableView).toHaveBeenCalledWith(
            'orders',
            'Team',
            expect.any(String),
            ['code'],
            'SHARED',
        );
    });

    it('reopens the remembered view unless the page was opened with a link', async () => {
        store.set('table-view:orders:admin-1', '7');
        const restored = setup();
        await restored.init();
        expect(apply).toHaveBeenCalledWith(STATE);
        apply.mockClear();
        const linked = setup(true);
        await linked.init();
        expect(apply).not.toHaveBeenCalled();
        expect(linked.activeId.value).toBe('7');
    });

    it('ignores a remembered view that no longer exists', async () => {
        store.set('table-view:orders:admin-1', '404');
        const v = setup();
        await v.init();
        expect(apply).not.toHaveBeenCalled();
        expect(v.activeId.value).toBe('');
    });

    it('is dirty once the table drifts from the active view and clean after reset', async () => {
        const v = setup();
        await v.init();
        v.select('7');
        expect(v.dirty.value).toBe(false);
        state.value = { ...state.value, filters: { search: '', view: 'all', conditions: [] } };
        expect(v.dirty.value).toBe(true);
        v.reset();
        expect(v.dirty.value).toBe(false);
    });

    it('updates and renames with one update call and keeps the view id', async () => {
        const v = setup();
        await v.init();
        v.select('7');
        state.value = { ...state.value, filters: { search: '', view: 'all', conditions: [] } };
        await v.update();
        expect(api.updateTableView).toHaveBeenCalledWith('7', {
            filters: JSON.stringify(state.value),
            visibleColumns: ['code'],
        });
        await v.rename('7', 'New');
        expect(api.updateTableView).toHaveBeenLastCalledWith('7', { name: 'New' });
        expect(api.saveTableView).not.toHaveBeenCalled();
        expect(api.deleteTableView).not.toHaveBeenCalled();
        expect(v.activeId.value).toBe('7');
    });

    it('reports a failed update without deleting anything', async () => {
        const v = setup();
        await v.init();
        api.updateTableView.mockRejectedValueOnce(new Error('boom'));
        await expect(v.rename('7', 'New')).rejects.toThrow('boom');
        expect(api.deleteTableView).not.toHaveBeenCalled();
        expect(v.busy.value).toBe(false);
    });

    it('applies the team default when nothing is remembered, but not under a link', async () => {
        api.fetchTableViews.mockResolvedValue([row('7', 'Mine'), row('8', 'Team', true, true)]);
        const opened = setup();
        await opened.init();
        expect(opened.activeId.value).toBe('8');
        expect(apply).toHaveBeenCalledTimes(1);
        apply.mockClear();
        store.clear();
        const linked = setup(true);
        await linked.init();
        expect(linked.activeId.value).toBe('');
        expect(apply).not.toHaveBeenCalled();
    });

    it('lets the remembered choice, even the built-in view, beat the team default', async () => {
        api.fetchTableViews.mockResolvedValue([row('7', 'Mine'), row('8', 'Team', true, true)]);
        store.set('table-view:orders:admin-1', '7');
        const own = setup();
        await own.init();
        expect(own.activeId.value).toBe('7');
        const builtIn = setup();
        builtIn.select('');
        const next = setup();
        await next.init();
        expect(next.activeId.value).toBe('');
    });

    it('sets and clears the team default through the server', async () => {
        const v = setup();
        await v.setDefault('8', true);
        expect(api.setTableViewDefault).toHaveBeenCalledWith('8', true);
        await v.setDefault('8', false);
        expect(api.setTableViewDefault).toHaveBeenLastCalledWith('8', false);
    });

    it('duplicates with a copy suffix and clears the choice when the active view is deleted', async () => {
        const v = setup();
        await v.init();
        await v.duplicate('7');
        expect(api.saveTableView).toHaveBeenCalledWith(
            'orders',
            'Overdue (copy)',
            expect.any(String),
            ['code'],
            'PERSONAL',
        );
        v.select('7');
        await v.remove('7');
        expect(v.activeId.value).toBe('');
        expect(store.has('table-view:orders:admin-1')).toBe(false);
    });
});
