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
    // Layout hints for the mobile card view (see MvAdvancedMobileCardList.vue) — mirrors
    // MvTable's own MvMobileColumnMeta (MvMobileCardList.vue) minus `actions`/`highlight`, which
    // no current consumer of this component needs; add them here if one does, following the same
    // pattern. Omit entirely for a column that should just render as a normal label/value pair.
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
