import { ref, watch, type Ref } from 'vue';

export interface DataTableSortMeta {
    field: string;
    order: 1 | -1;
}

// One blob for the full table state (layout, sort, filters, page size) per table.
// localStorage only: a personal display preference, not business data, so no backend entity.
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

// Kept thin on purpose so this composable doesn't depend on MvAdvancedDataTable's column type.
export interface DataTableColumnMeta {
    field: string;
    width: number;
    required?: boolean;
    sortField?: string;
}

export interface UseDataTableStateOptions {
    columns: DataTableColumnMeta[];
    // Derive valid keys from column filterConfig and the search filterKey, not from defaults:
    // not every valid filter key has a default value, so defaults under-reports allowed keys.
    allowedFilterKeys: Iterable<string>;
    // Bump only for a structural DataTableState change (field renamed, removed, or reshaped).
    // Column-list and filter-key changes are handled by normalization, not a bump.
    schemaVersion?: number;
    // pageSize and some filter keys may be owned by a parent page; a stale saved value would
    // disagree with what the parent fetches. Declared here, they always seed from defaults.
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

// Normalize on load so stale, partial, or corrupted blobs with a wrong field shape can't
// crash or misbehave. Only a structural DataTableState change needs a schemaVersion bump.
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
                // localStorage may be full or unavailable; the table then just won't persist its layout
                // this session. Nothing else depends on it.
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
