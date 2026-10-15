import type { SelectOption } from '../MvSelect/MvSelect.vue';
import type { ColumnVisibilityDef } from '../../composables/useColumnVisibility';

// Deliberately separate from the table's rendering Column<T>: filters may have no visible column
// (free-text, date range) and columns may have no filter, so one shared array would not fit both.
export type DataTableFilterKind = 'search' | 'select';

export interface DataTableColumnFilter {
    kind: DataTableFilterKind;
    placeholder?: string;
    // Required for kind: 'select'; ignored for 'search'.
    options?: SelectOption[];
}

export interface MvDataTableColumn {
    key: string;
    // Falls back to `key` if omitted (e.g. a pure-filter entry that reads oddly as a "label",
    // like the free-text search box).
    title?: string;
    required?: boolean;
    filter?: DataTableColumnFilter;
}

// Derived from the toolbar's column config, so there is no second hand-maintained list.
// storageKey stays page-owned: visibility state is per-admin localStorage.
export function toColumnVisibilityDefs(columns: MvDataTableColumn[]): ColumnVisibilityDef[] {
    return columns.map(c => ({
        key: c.key,
        label: c.title ?? c.key,
        required: c.required,
    }));
}
