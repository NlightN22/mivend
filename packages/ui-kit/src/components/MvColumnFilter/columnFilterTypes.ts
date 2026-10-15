import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

// Every column must declare its filter type explicitly, so no column silently has no filter config.
// `custom` is the only escape hatch for non-standard filters; callers supply content via a slot.
export const COLUMN_FILTER_TYPES = [
    'text',
    'select',
    'boolean',
    'status',
    'enum',
    'single-date',
    'date-range',
    'amount-range',
    'custom',
    'none',
] as const;
export type ColumnFilterType = (typeof COLUMN_FILTER_TYPES)[number];

export interface ColumnFilterOption {
    value: string;
    label: string;
}
export interface ColumnFilterStatusOption extends ColumnFilterOption {
    variant: StatusBadgeVariant;
}

export interface TextFilterConfig {
    type: 'text';
    placeholder?: string;
    debounceMs?: number;
}
export interface SelectFilterConfig {
    type: 'select';
    options: ColumnFilterOption[];
    placeholder?: string;
}
export interface BooleanFilterConfig {
    type: 'boolean';
    // Labels default to Any/Yes/No — overridable for a column where those read oddly (e.g. "Has
    // attachments": Any/Yes/No is fine, but a future boolean column might read better differently).
    labels?: { any?: string; yes?: string; no?: string };
}
export interface StatusFilterConfig {
    type: 'status';
    options: ColumnFilterStatusOption[];
    // Single-select by default: the backend filter accepts only `eq`, not an `in` list.
    // Enable multi only after the column's backend query supports `in`.
    multiple?: boolean;
    placeholder?: string;
}
export interface EnumFilterConfig {
    type: 'enum';
    options: ColumnFilterOption[];
    multiple?: boolean;
    placeholder?: string;
}
export interface SingleDateFilterConfig {
    type: 'single-date';
    placeholder?: string;
}
export interface DateRangePreset {
    key: string;
    label: string;
}
// Presets resolve to a concrete {from,to} at selection time; 'custom' is always available.
// Calendar resolution lives in the component, not the config, because it is not column-specific.
export interface DateRangeFilterConfig {
    type: 'date-range';
    presets?: DateRangePreset[];
}
export interface AmountRangePreset {
    label: string;
    min: number | undefined;
    max: number | undefined;
}
export interface AmountRangeFilterConfig {
    type: 'amount-range';
    currencyCode: string;
    presets?: AmountRangePreset[];
}
// Slot-rendered — the column author supplies the content, but must still say so explicitly.
export interface CustomFilterConfig {
    type: 'custom';
}
// ColumnDef.filter is required, so omitting it is a compile error rather than a silent gap.
export interface NoFilterConfig {
    type: 'none';
}

export type ColumnFilterConfig =
    | TextFilterConfig
    | SelectFilterConfig
    | BooleanFilterConfig
    | StatusFilterConfig
    | EnumFilterConfig
    | SingleDateFilterConfig
    | DateRangeFilterConfig
    | AmountRangeFilterConfig
    | CustomFilterConfig
    | NoFilterConfig;

export type BooleanFilterValue = 'any' | 'yes' | 'no';
export interface DateRangeFilterValue {
    // The preset key is stored alongside the resolved from/to so the UI can highlight the active preset.
    // It cannot be re-derived from the dates alone; 'custom' marks a user-typed range.
    preset: string;
    from: string; // ISO date (yyyy-mm-dd), '' = open start
    to: string; // ISO date (yyyy-mm-dd), '' = open end
}
export interface AmountRangeFilterValue {
    mode: 'range' | 'equal' | 'more' | 'less';
    // Always major currency units (dollars, not cents); minor-unit conversion happens only at the API boundary.
    // Never convert inside the filter component, so the table layer owns the wire format.
    min: number | undefined;
    max: number | undefined;
}

// Normalized value stored in DataTableState.filters and read by the server-request mapper.
// Only committed values belong here; widget state (open flags, displayed month) must not leak in.
export interface ColumnFilterValueMap {
    text: string;
    select: string;
    boolean: BooleanFilterValue;
    status: string | string[];
    enum: string | string[];
    'single-date': string; // ISO date (yyyy-mm-dd), '' = no filter
    'date-range': DateRangeFilterValue;
    'amount-range': AmountRangeFilterValue;
    custom: unknown;
    none: never;
}
