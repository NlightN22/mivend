import type { ColumnFilterConfig } from '../MvColumnFilter/columnFilterTypes';
import type {
    FilterColumn,
    FilterOperator,
    FilterOption,
    FilterSuggest,
    FilterType,
} from '../MvFilterBuilder/filterBuilderTypes';

// `field` is a stable string id, not checked against TRow; it keys column state and slot names.
// Nested values (e.g. `order.code`) must use a `#cell-<field>` slot, not a dotted `field`.
export interface AdvancedDataTableColumn {
    field: string;
    header: string;
    width: number;
    // `width` is already a hard cap (table-layout: fixed); min/max matter only for resizable columns.
    // Or a legibility floor, such as a status badge that must not shrink.
    minWidth?: number;
    maxWidth?: number;
    // 'end' right-aligns the header and cells (money columns); mobile cards are unaffected.
    align?: 'start' | 'end';
    // Higher keeps its width when the table is tight: lower ones shrink to minWidth first, then
    // drop out of view (still in the column settings). Set minWidth = width to never shrink.
    priority?: number;
    // Never hideable via the column toggle.
    required?: boolean;
    // Omit entirely for a column with no server-side sort support — no sort UI renders for it.
    sortField?: string;
    filterConfig: ColumnFilterConfig;
    // Takes the column into the toolbar Filter builder; leave `filterConfig` as `none` then.
    filterType?: FilterType;
    filterOptions?: FilterOption[];
    filterOperators?: FilterOperator[];
    filterField?: string;
    filterScale?: number;
    filterSuggest?: FilterSuggest;
    // Mirrors MvMobileColumnMeta minus `actions`/`highlight`; add them here if a consumer needs them.
    mobile?: {
        // Card title — at most one column should set this.
        primary?: boolean;
        // Rendered top-right next to the title, alongside the primary field (e.g. a status
        // badge) — at most one column should set this.
        badge?: boolean;
        // Omitted from the card entirely (e.g. a column only useful for desktop filtering).
        hidden?: boolean;
    };
}

export interface AdvancedDataTableSearchConfig {
    filterKey: string;
    placeholder?: string;
    debounceMs?: number;
}

export interface AdvancedDataTableRowClickPayload<TRow = unknown> {
    row: TRow;
    originalEvent: Event;
}

export function toFilterColumns(columns: AdvancedDataTableColumn[]): FilterColumn[] {
    return columns.flatMap(c =>
        c.filterType
            ? [
                  {
                      key: c.field,
                      label: c.header,
                      type: c.filterType,
                      options: c.filterOptions,
                      operators: c.filterOperators,
                      serverField: c.filterField,
                      scale: c.filterScale,
                      suggest: c.filterSuggest,
                  },
              ]
            : [],
    );
}
