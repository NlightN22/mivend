import type {
    AmountRangeFilterValue,
    ColumnFilterConfig,
    DateRangeFilterValue,
} from './columnFilterTypes';
import { DATE_RANGE_PRESETS } from './dateRangePresets';

// PrimeVue's own column-filter overlay has no exposed handle to close it from a fully custom
// `#filter` template (its open/close state is internal to the ColumnFilter it wraps) — dispatching
// a click on <body> triggers the overlay's own outside-click listener, closing it the same way
// clicking elsewhere on the page already does. Best-effort: confirmed live this doesn't reliably
// fire for every column/interaction — a real user click outside (or Escape) still closes it
// normally either way, so this only affects whether a single-value pick closes the popover for
// you automatically vs. requiring one more click. Guarded for non-DOM environments (unit tests) —
// this workaround must stay isolated to filter-overlay interaction, never used more generally.
export function closePrimeVueFilterOverlay(): void {
    if (typeof document !== 'undefined') document.body.click();
}

// Decides how a filter type commits: 'instant-close' (a single pick fully specifies the filter,
// so close immediately — select/boolean/single-date, and status/enum when not multi-select),
// 'instant-stay' (text — where typing shouldn't close anything mid-word; and multi-select
// status/enum, where several boxes need to stay open to tick in a row), or 'manual' (amount-range
// calls emit itself only on its own Apply/Clear; custom/none never go through this generic path
// at all).
export function interactionMode(
    config: ColumnFilterConfig,
): 'instant-close' | 'instant-stay' | 'manual' {
    switch (config.type) {
        case 'text':
            return 'instant-stay';
        case 'status':
        case 'enum':
            return config.multiple ? 'instant-stay' : 'instant-close';
        case 'select':
        case 'boolean':
        case 'single-date':
            return 'instant-close';
        case 'amount-range':
        case 'date-range':
        case 'custom':
        case 'none':
            return 'manual';
    }
}

// `'mode' in value` (not `'min' in value`) is the discriminator for AmountRangeFilterValue —
// deliberately, not incidentally. Persisted filter state round-trips through `JSON.stringify`/
// `JSON.parse` (see useDataTableState), which drops any key whose value is `undefined` — an
// all-empty amount-range value (`{ mode: 'range', min: undefined, max: undefined }`) round-trips
// as just `{"mode":"range"}`, with `min`/`max` gone entirely. Checking `'min' in value` then fails
// (the key isn't there), falls through to `!!value`, and a completely empty filter reads as
// "active" forever — a real, confirmed bug this exact check prevents. `mode` is a plain
// non-optional string, so unlike `min`/`max` it always survives the round-trip.
export function hasValue(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object' && 'mode' in value) {
        const v = value as AmountRangeFilterValue;
        return v.min !== undefined || v.max !== undefined;
    }
    if (value && typeof value === 'object' && 'preset' in value) {
        const v = value as DateRangeFilterValue;
        return !!v.preset;
    }
    return !!value;
}

// Renders an active filter's current value as a short, human string for the "Active filters" chip
// row. Currency symbol is derived from `config.currencyCode` via `Intl.NumberFormat` directly —
// this is pure ISO-4217-to-symbol lookup, not business data, so it needs no extra input beyond
// the already-generic `AmountRangeFilterConfig`.
export function describeValue(config: ColumnFilterConfig, value: unknown): string {
    if (!hasValue(value)) return '';
    switch (config.type) {
        case 'status':
        case 'enum': {
            const values = Array.isArray(value) ? value : [value as string];
            if (values.length > 1) return `${values.length} selected`;
            return config.options.find(o => o.value === values[0])?.label ?? String(values[0]);
        }
        case 'text':
            return `"${value as string}"`;
        case 'date-range': {
            const v = value as DateRangeFilterValue;
            if (v.preset && v.preset !== 'custom') {
                const presets = config.presets ?? DATE_RANGE_PRESETS;
                return presets.find(p => p.key === v.preset)?.label ?? v.preset;
            }
            return v.from && v.to ? `${v.from} – ${v.to}` : v.from || v.to;
        }
        case 'amount-range': {
            const v = value as AmountRangeFilterValue;
            const parts = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: config.currencyCode,
            }).formatToParts(0);
            const s = parts.find(p => p.type === 'currency')?.value ?? config.currencyCode;
            if (v.mode === 'equal') return `= ${s}${v.min}`;
            if (v.mode === 'more') return `≥ ${s}${v.min}`;
            if (v.mode === 'less') return `≤ ${s}${v.max}`;
            if (v.min !== undefined && v.max !== undefined) return `${s}${v.min}–${s}${v.max}`;
            if (v.min !== undefined) return `≥ ${s}${v.min}`;
            return `≤ ${s}${v.max}`;
        }
        default:
            return String(value);
    }
}
