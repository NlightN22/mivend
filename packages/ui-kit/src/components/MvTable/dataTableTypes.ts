import type { SelectOption } from '../MvSelect/MvSelect.vue';
import type { ColumnVisibilityDef } from '../../composables/useColumnVisibility';

// One toolbar config entry drives both concerns a page used to hand-wire separately: whether
// the column appears in the "Columns" visibility toggle (`required` — same meaning as
// ColumnVisibilityDef.required) and whether/how it gets a filter field in MvDataTableToolbar
// (`filter`). This is the single-source-of-truth shape recommended by TanStack Table's/shadcn's
// data-table pattern (column defs drive visibility + faceted filters together) — see
// MvDataTableToolbar.vue's doc comment for the full rationale.
//
// Deliberately NOT the same object as the table's own rendering `Column<T>` (width/cellRenderer/
// etc.) — a real page's filter set commonly includes entries with no matching visible column
// (free-text search, a date-range filter) and vice versa (a "Branch" column with no filter of
// its own), so forcing one identical array to serve both rendering and toolbar config fights
// reality more than it helps. This type is the toolbar's own minimal metadata; the Table
// component keeps owning its rendering columns exactly as before.
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

// Derives the Columns-toggle input from the same array a page passes to MvDataTableToolbar, so
// it never hand-maintains a second parallel {key, label, required} list — see
// useColumnVisibility's own doc comment for why the toggle state itself still needs a
// page-owned storageKey (per-admin localStorage), which this helper deliberately doesn't touch.
export function toColumnVisibilityDefs(columns: MvDataTableColumn[]): ColumnVisibilityDef[] {
    return columns.map(c => ({
        key: c.key,
        label: c.title ?? c.key,
        required: c.required,
    }));
}
