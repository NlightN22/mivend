import type { ColumnFilterConfig } from '../MvColumnFilter/columnFilterTypes';

// `TRow` types what Vue tooling can actually check for a consumer: the `rows` array, the
// `row-click` payload, and scoped-slot payloads as far as Vue supports — it is deliberately NOT
// used to force `field` to be `keyof TRow`. A column id is a stable string contract (used as a
// key into filter/column state and as the `#cell-<field>`/`#filter-<field>` slot-name suffix),
// independent of whatever shape the row object happens to have — nested/computed values (e.g.
// `order.code`) always go through a `#cell-<field>` slot rather than a dotted `field`.
export interface AdvancedDataTableColumn {
    field: string;
    header: string;
    width: number;
    // Never hideable via the column toggle.
    required?: boolean;
    // Omit entirely for a column with no server-side sort support — no sort UI renders for it.
    sortField?: string;
    filterConfig: ColumnFilterConfig;
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
