import { ref, watch, type Ref } from 'vue';

export interface DataTableSortMeta {
    field: string;
    order: 1 | -1;
}

// Everything a rich data-grid (column order/width/visibility, sort, filters, page size) needs
// persisted per admin, per table — one storage blob instead of useColumnVisibility's
// hidden-keys-only Set, for tables that need the fuller PrimeVue DataTable feature set (see
// OrdersDataTable.vue, the first adopter). Same "personal display preference, not business
// data" reasoning as useColumnVisibility (AGENTS.md) — no backend entity, localStorage only.
export interface DataTableState<
    FiltersT extends Record<string, unknown> = Record<string, unknown>,
> {
    columnOrder: string[];
    columnWidths: Record<string, number>;
    hiddenColumns: string[];
    sort: DataTableSortMeta[];
    filters: FiltersT;
    pageSize: number;
}

export function useDataTableState<FiltersT extends Record<string, unknown>>(
    storageKey: string,
    defaults: DataTableState<FiltersT>,
): {
    state: Ref<DataTableState<FiltersT>>;
    reset: () => void;
} {
    const stored = (() => {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? (JSON.parse(raw) as DataTableState<FiltersT>) : null;
        } catch {
            return null;
        }
    })();

    const state = ref<DataTableState<FiltersT>>(stored ?? { ...defaults }) as Ref<
        DataTableState<FiltersT>
    >;

    watch(
        state,
        value => {
            try {
                localStorage.setItem(storageKey, JSON.stringify(value));
            } catch {
                // Personal display preference only — a full/unavailable localStorage just means
                // the table doesn't remember its layout across reloads this session, nothing
                // else breaks (same tradeoff as useColumnVisibility).
            }
        },
        { deep: true },
    );

    function reset(): void {
        try {
            localStorage.removeItem(storageKey);
        } catch {
            // See above.
        }
        state.value = { ...defaults };
    }

    return { state, reset };
}
