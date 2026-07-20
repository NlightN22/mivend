import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import {
    useDataTableState,
    type DataTableState,
    type UseDataTableStateOptions,
} from '../../composables/useDataTableState';

// Same in-memory localStorage mock convention as packages/storefront's favorites.store.test.ts.
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();
vi.stubGlobal('localStorage', localStorageMock);

interface Filters {
    [key: string]: unknown;
    status: string;
}

const OPTIONS: UseDataTableStateOptions = {
    columns: [
        { field: 'code', width: 100, required: true },
        { field: 'status', width: 80 },
    ],
    allowedFilterKeys: ['status'],
};

function defaults(): DataTableState<Filters> {
    return {
        columnOrder: ['code', 'status'],
        columnWidths: { code: 100, status: 80 },
        hiddenColumns: [],
        sort: [],
        filters: { status: '' },
        pageSize: 20,
    };
}

describe('useDataTableState', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    it('seeds state from defaults when nothing is persisted yet', () => {
        const { state } = useDataTableState('test-key', defaults(), OPTIONS);
        expect(state.value).toEqual(defaults());
    });

    it('persists state to localStorage and restores it on the next call', async () => {
        const { state } = useDataTableState('persist-key', defaults(), OPTIONS);
        state.value.hiddenColumns = ['status'];
        await nextTick();

        const { state: restored } = useDataTableState('persist-key', defaults(), OPTIONS);
        expect(restored.value.hiddenColumns).toEqual(['status']);
    });

    it('falls back to defaults when the schemaVersion does not match', async () => {
        const { state } = useDataTableState('version-key', defaults(), {
            ...OPTIONS,
            schemaVersion: 1,
        });
        state.value.pageSize = 50;
        await nextTick();

        const { state: restored } = useDataTableState('version-key', defaults(), {
            ...OPTIONS,
            schemaVersion: 2,
        });
        expect(restored.value.pageSize).toBe(20);
    });

    it('falls back to defaults when the persisted JSON is corrupted', () => {
        localStorageMock.setItem('corrupted-key', '{not valid json');
        const { state } = useDataTableState('corrupted-key', defaults(), OPTIONS);
        expect(state.value).toEqual(defaults());
    });

    it('falls back to defaults when the persisted value is a completely incompatible shape', () => {
        localStorageMock.setItem('incompatible-key', JSON.stringify(['just', 'an', 'array']));
        const { state } = useDataTableState('incompatible-key', defaults(), OPTIONS);
        expect(state.value).toEqual(defaults());
    });

    it('resetColumns restores column layout without touching filters', () => {
        const { state, resetColumns } = useDataTableState('reset-columns-key', defaults(), OPTIONS);
        state.value.hiddenColumns = ['status'];
        state.value.columnOrder = ['status', 'code'];
        state.value.columnWidths = { code: 300, status: 400 };
        state.value.filters = { status: 'pending' };

        resetColumns();

        expect(state.value.hiddenColumns).toEqual([]);
        expect(state.value.columnOrder).toEqual(['code', 'status']);
        expect(state.value.columnWidths).toEqual({ code: 100, status: 80 });
        expect(state.value.filters).toEqual({ status: 'pending' });
    });

    it('clearFilters restores defaultFilters without touching column layout', () => {
        const { state, clearFilters } = useDataTableState('clear-filters-key', defaults(), OPTIONS);
        state.value.columnOrder = ['status', 'code'];
        state.value.filters = { status: 'pending' };

        clearFilters();

        expect(state.value.filters).toEqual({ status: '' });
        expect(state.value.columnOrder).toEqual(['status', 'code']);
    });
});
