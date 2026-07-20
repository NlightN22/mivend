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

// The minimum a saved-state normalization pass needs to know about a table's current columns —
// deliberately thinner than a full column-def type (header/filterConfig aren't its concern), so
// this composable stays independent of MvAdvancedDataTable's richer column type.
export interface DataTableColumnMeta {
    field: string;
    width: number;
    required?: boolean;
    sortField?: string;
}

export interface UseDataTableStateOptions {
    columns: DataTableColumnMeta[];
    // Which `filters` keys are legitimate for this table right now — driven by the table's own
    // column/search config (a column's filterConfig.type !== 'none', plus a search filterKey if
    // any), never by `Object.keys(defaults.filters)`: not every valid filter key needs a default
    // value, so `defaults` alone would under-report what's actually allowed.
    allowedFilterKeys: Iterable<string>;
    // Bump only for a genuinely incompatible *structural* change to DataTableState itself (a
    // field renamed/removed/reshaped at the DataTableState level) — ordinary column-list or
    // filter-key changes are handled by normalization below and no longer need a manual bump.
    schemaVersion?: number;
    // Real incident this exists to prevent structurally, not just by convention: `pageSize` and
    // some `filters` keys are sometimes not this table's own concern at all — they're actually
    // driven by a parent page that owns the real data fetch (e.g. a customer-detail tab's own
    // `page`/`pageSize` refs, or a view-chip bar writing a `status` filter from outside the
    // table entirely). If localStorage holds a *stale* value for one of those (saved by an
    // earlier session with a different pageSize/filter selection), naively restoring it produces
    // a table whose internal state disagrees with what the parent is actually fetching from the
    // moment it mounts — not just after some future change. A parent-side `watch(prop, ...,
    // { immediate: true })` reconciling this is easy to forget (real incident: it was, twice, in
    // this project). Declaring the externally-owned fields here instead means `useDataTableState`
    // itself always seeds them from `defaults` — the caller's own current prop values — never
    // from whatever localStorage happened to have, no watcher required to get the *initial* value
    // right.
    externallyOwned?: {
        pageSize?: boolean;
        filterKeys?: string[];
    };
}

const DEFAULT_SCHEMA_VERSION = 1;

interface PersistedBlob<FiltersT extends Record<string, unknown>> {
    schemaVersion: number;
    state: DataTableState<FiltersT>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Reconciles a saved (possibly stale, partial, or corrupted) state blob against the table's
// *current* column/filter configuration. Replaces the old "bump the storage key by hand whenever
// columns or filter shapes change" workaround — real, repeated incident that fix worked around:
// this table's filter *shapes* changed more than once (a field gaining a real object shape, a
// single string becoming a multi-select string[]), and a stale blob's field of the wrong runtime
// shape either crashed downstream code or silently misbehaved. Normalizing on load means an
// ordinary column/filter change just works; only a structural DataTableState change still needs
// `schemaVersion` bumped.
export function normalizeDataTableState<FiltersT extends Record<string, unknown>>(
    saved: unknown,
    defaults: DataTableState<FiltersT>,
    options: UseDataTableStateOptions,
): DataTableState<FiltersT> {
    if (!isPlainObject(saved)) return { ...defaults };
    const savedState = saved as Partial<DataTableState<FiltersT>>;

    const knownFields = new Set(options.columns.map(c => c.field));
    const requiredFields = new Set(options.columns.filter(c => c.required).map(c => c.field));
    const sortableFields = new Set(options.columns.filter(c => c.sortField).map(c => c.field));
    const allowedFilterKeys = new Set(options.allowedFilterKeys);

    const savedHidden = Array.isArray(savedState.hiddenColumns) ? savedState.hiddenColumns : [];
    const hiddenColumns = savedHidden.filter(
        (field): field is string =>
            typeof field === 'string' && knownFields.has(field) && !requiredFields.has(field),
    );

    const savedOrder = Array.isArray(savedState.columnOrder) ? savedState.columnOrder : [];
    const knownOrderedFields = savedOrder.filter(
        (field): field is string => typeof field === 'string' && knownFields.has(field),
    );
    const missingFromOrder = options.columns
        .map(c => c.field)
        .filter(field => !knownOrderedFields.includes(field));
    const columnOrder = [...knownOrderedFields, ...missingFromOrder];

    const savedWidths = isPlainObject(savedState.columnWidths) ? savedState.columnWidths : {};
    const columnWidths = Object.fromEntries(
        options.columns.map(c => [
            c.field,
            typeof savedWidths[c.field] === 'number' ? (savedWidths[c.field] as number) : c.width,
        ]),
    );

    const savedSort = Array.isArray(savedState.sort) ? savedState.sort : [];
    const sort = savedSort.filter(
        (entry): entry is DataTableSortMeta =>
            isPlainObject(entry) &&
            typeof (entry as Partial<DataTableSortMeta>).field === 'string' &&
            sortableFields.has((entry as DataTableSortMeta).field) &&
            ((entry as Partial<DataTableSortMeta>).order === 1 ||
                (entry as Partial<DataTableSortMeta>).order === -1),
    );

    const savedFilters: Record<string, unknown> = isPlainObject(savedState.filters)
        ? savedState.filters
        : {};
    const filters = { ...defaults.filters } as Record<string, unknown>;
    for (const key of Object.keys(savedFilters)) {
        if (allowedFilterKeys.has(key)) filters[key] = savedFilters[key];
    }

    const pageSize =
        options.externallyOwned?.pageSize ||
        !(typeof savedState.pageSize === 'number' && savedState.pageSize > 0)
            ? defaults.pageSize
            : savedState.pageSize;

    for (const key of options.externallyOwned?.filterKeys ?? []) {
        filters[key] = (defaults.filters as Record<string, unknown>)[key];
    }

    return {
        columnOrder,
        columnWidths,
        hiddenColumns,
        sort,
        filters: filters as FiltersT,
        pageSize,
    };
}

export function useDataTableState<FiltersT extends Record<string, unknown>>(
    storageKey: string,
    defaults: DataTableState<FiltersT>,
    options: UseDataTableStateOptions,
): {
    state: Ref<DataTableState<FiltersT>>;
    // Two distinct actions, not one "reset everything" — a layout reset and a filter reset are
    // unrelated user intents (see MvAdvancedDataTable's "Reset columns"/"Clear filters" split).
    resetColumns: () => void;
    clearFilters: () => void;
} {
    const schemaVersion = options.schemaVersion ?? DEFAULT_SCHEMA_VERSION;

    function load(): DataTableState<FiltersT> {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return { ...defaults };
            const parsed = JSON.parse(raw) as Partial<PersistedBlob<FiltersT>>;
            if (!isPlainObject(parsed) || parsed.schemaVersion !== schemaVersion)
                return { ...defaults };
            return normalizeDataTableState(parsed.state, defaults, options);
        } catch {
            return { ...defaults };
        }
    }

    const state = ref<DataTableState<FiltersT>>(load()) as Ref<DataTableState<FiltersT>>;

    watch(
        state,
        value => {
            try {
                localStorage.setItem(
                    storageKey,
                    JSON.stringify({
                        schemaVersion,
                        state: value,
                    } satisfies PersistedBlob<FiltersT>),
                );
            } catch {
                // Personal display preference only — a full/unavailable localStorage just means
                // the table doesn't remember its layout across reloads this session, nothing
                // else breaks (same tradeoff as useColumnVisibility).
            }
        },
        { deep: true },
    );

    function resetColumns(): void {
        state.value.columnOrder = options.columns.map(c => c.field);
        state.value.columnWidths = Object.fromEntries(options.columns.map(c => [c.field, c.width]));
        state.value.hiddenColumns = [];
    }

    function clearFilters(): void {
        state.value.filters = { ...defaults.filters };
    }

    return { state, resetColumns, clearFilters };
}
