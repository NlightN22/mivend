import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

// Every data-table column filter in the app must declare one of these types explicitly — no
// implicit/generic fallback (see AGENTS.md's manager-portal rules: a filter's shape must be
// known statically, not guessed at render time). `custom` is the one sanctioned escape hatch for
// a filter that genuinely isn't one of the standard patterns (e.g. Payment's paymentView chips,
// which drive an entirely different GraphQL query, not a plain OrderFilterParameter field) —
// callers render their own content for it via a slot, but must still declare it, so a column can
// never silently end up with no filter config at all.
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
    // Defaults to false (single-select) — deliberately kept single for existing columns
    // (Commercial state) since the backend filter today takes `eq`, not `in`; a column can opt
    // into multi once its backend query supports an `in` list.
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
// A named preset (Today/Last 7 days/This month/…) resolved to an actual {from,to} span at
// selection time, plus an always-available 'custom' escape hatch — see DATE_RANGE_PRESETS in
// MvColumnFilterDateRange.vue for the default set and their resolution logic. Deliberately a
// simpler first pass (see this type's own file for the fuller design this is standing in for
// right now) — presets list is overridable per column but the resolution logic itself
// (today/yesterday/last-N-days/this-month/previous-month) lives in the component, not the config,
// since it's calendar math, not column-specific data.
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
// The explicit opt-out for a column with no meaningful filter (e.g. a plain quantity count) —
// distinct from omitting the field entirely, which TypeScript now catches (see ColumnDef.filter
// being a required, not optional, property wherever this type is used).
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
    // 'custom' means the user typed their own from/to; any other value is a preset key from
    // DATE_RANGE_PRESETS (or the column's own override list) — kept alongside the resolved
    // from/to so the UI can re-highlight which preset is active without re-deriving it from the
    // dates themselves.
    preset: string;
    from: string; // ISO date (yyyy-mm-dd), '' = open start
    to: string; // ISO date (yyyy-mm-dd), '' = open end
}
export interface AmountRangeFilterValue {
    mode: 'range' | 'equal' | 'more' | 'less';
    // Always major currency units (e.g. dollars, not cents) — minor-unit conversion for the wire
    // format happens at the API-mapping boundary, never inside the filter component itself (see
    // CustomerOrdersDataTable.vue's toMinorUnits/toMajorUnits — that's a table/API concern, not a
    // UI-component concern).
    min: number | undefined;
    max: number | undefined;
}

// The normalized value shape for each filter type — this is what gets stored in the table's own
// filter state (DataTableState.filters) and what a server-request mapper reads from. UI
// components never leak their own internal widget state (a Select's open/closed flag, a
// DatePicker's currently-displayed month, etc.) into this — only the committed value.
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
