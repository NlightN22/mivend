import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

const api = vi.hoisted(() => ({
    fetchMyTableViews: vi.fn(),
    saveTableView: vi.fn(),
    deleteTableView: vi.fn(),
}));
vi.mock('../../api/tableViews', () => api);

import { useTableViews, type TableViews } from '../../composables/useTableViews';
import type { TableViewState } from '../../composables/tableViewState';

const STATE: TableViewState = {
    filters: { view: 'overdue' },
    sort: { field: 'createdAt', dir: 'DESC' },
    columnOrder: ['code', 'date'],
    hiddenColumns: ['date'],
};
const row = (id: string, name: string, state = STATE): Record<string, unknown> => ({
    id,
    name,
    filters: JSON.stringify(state),
    visibleColumns: [],
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
    state.value = { ...STATE, filters: { view: 'all' } };
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
    });
    api.fetchMyTableViews.mockResolvedValue([row('7', 'Overdue')]);
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
        );
        expect(v.activeId.value).toBe('9');
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
        state.value = { ...state.value, filters: { view: 'all' } };
        expect(v.dirty.value).toBe(true);
        v.reset();
        expect(v.dirty.value).toBe(false);
    });

    it('updates by saving the new state before deleting the old row', async () => {
        const calls: string[] = [];
        api.saveTableView.mockImplementation(async () => (calls.push('save'), { id: '9' }));
        api.deleteTableView.mockImplementation(async () => (calls.push('delete'), true));
        const v = setup();
        await v.init();
        v.select('7');
        state.value = { ...state.value, filters: { view: 'all' } };
        await v.update();
        expect(calls).toEqual(['save', 'delete']);
        expect(v.activeId.value).toBe('9');
    });

    it('keeps the old row when saving the replacement fails', async () => {
        const v = setup();
        await v.init();
        api.saveTableView.mockRejectedValueOnce(new Error('boom'));
        await expect(v.rename('7', 'New')).rejects.toThrow('boom');
        expect(api.deleteTableView).not.toHaveBeenCalled();
        expect(v.busy.value).toBe(false);
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
        );
        v.select('7');
        await v.remove('7');
        expect(v.activeId.value).toBe('');
        expect(store.has('table-view:orders:admin-1')).toBe(false);
    });
});
