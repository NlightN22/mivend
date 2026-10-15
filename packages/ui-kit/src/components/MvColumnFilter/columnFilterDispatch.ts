import type {
    AmountRangeFilterValue,
    ColumnFilterConfig,
    DateRangeFilterValue,
} from './columnFilterTypes';
import { DATE_RANGE_PRESETS } from './dateRangePresets';

// PrimeVue's ColumnFilter exposes no close handle; a body click reuses its outside-click listener.
// Guarded for non-DOM test environments. Keep this limited to filter-overlay interaction.
export function closePrimeVueFilterOverlay(): void {
    if (typeof document !== 'undefined') document.body.click();
}

// PrimeVue's menu-mode ColumnFilter keeps a stale selfClick flag that swallows the next outside click.
// Reset via a synchronous body click on document: a deferred one loses to a fast follow-up click.
export function installFilterOverlayClickFix(): () => void {
    if (typeof document === 'undefined') return () => {};
    const handler = (event: MouseEvent): void => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.p-datatable-filter-overlay')) {
            closePrimeVueFilterOverlay();
        }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
}

// Multi-select enum/status stays open so several boxes can be ticked in a row.
// Text stays open while typing; amount-range commits only on its own Apply/Clear.
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

// Checks 'mode' not 'min': JSON round-trip drops undefined keys, so an empty range loses min/max.
// Otherwise 'min' in value fails, and an empty filter reads as active forever. mode always survives.
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

// Symbol is a pure ISO-4217 lookup, not business data, so it needs no config beyond currencyCode.
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
