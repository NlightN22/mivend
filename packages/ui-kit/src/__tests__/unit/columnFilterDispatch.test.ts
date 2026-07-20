import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    interactionMode,
    hasValue,
    describeValue,
    closePrimeVueFilterOverlay,
} from '../../components/MvColumnFilter/columnFilterDispatch';
import type { ColumnFilterConfig } from '../../components/MvColumnFilter/columnFilterTypes';

describe('interactionMode', () => {
    it('is instant-stay for text (already debounced upstream)', () => {
        expect(interactionMode({ type: 'text' })).toBe('instant-stay');
    });

    it('is instant-close for single-select status/enum, instant-stay for multi-select', () => {
        expect(interactionMode({ type: 'status', options: [] })).toBe('instant-close');
        expect(interactionMode({ type: 'status', options: [], multiple: true })).toBe(
            'instant-stay',
        );
        expect(interactionMode({ type: 'enum', options: [] })).toBe('instant-close');
        expect(interactionMode({ type: 'enum', options: [], multiple: true })).toBe('instant-stay');
    });

    it('is instant-close for select/boolean/single-date', () => {
        expect(interactionMode({ type: 'select', options: [] })).toBe('instant-close');
        expect(interactionMode({ type: 'boolean' })).toBe('instant-close');
        expect(interactionMode({ type: 'single-date' })).toBe('instant-close');
    });

    it('is manual for amount-range/date-range/custom/none', () => {
        expect(interactionMode({ type: 'amount-range', currencyCode: 'USD' })).toBe('manual');
        expect(interactionMode({ type: 'date-range' })).toBe('manual');
        expect(interactionMode({ type: 'custom' })).toBe('manual');
        expect(interactionMode({ type: 'none' })).toBe('manual');
    });
});

describe('hasValue', () => {
    it('is false for empty/undefined/falsy primitives, true otherwise', () => {
        expect(hasValue('')).toBe(false);
        expect(hasValue(undefined)).toBe(false);
        expect(hasValue(null)).toBe(false);
        expect(hasValue('x')).toBe(true);
    });

    it('checks array length', () => {
        expect(hasValue([])).toBe(false);
        expect(hasValue(['a'])).toBe(true);
    });

    it('checks amount-range by min/max, not by key presence (survives localStorage round-trip)', () => {
        // JSON.stringify drops undefined-valued keys — this is exactly the shape that comes back
        // out of localStorage for an all-empty amount-range filter.
        expect(
            hasValue(JSON.parse(JSON.stringify({ mode: 'range', min: undefined, max: undefined }))),
        ).toBe(false);
        expect(hasValue({ mode: 'less', max: 100 })).toBe(true);
        expect(hasValue({ mode: 'more', min: 10 })).toBe(true);
    });

    it('checks date-range by preset presence', () => {
        expect(hasValue({ preset: '', from: '', to: '' })).toBe(false);
        expect(hasValue({ preset: 'last7days', from: '', to: '' })).toBe(true);
    });
});

describe('describeValue', () => {
    it('returns empty string when there is no value', () => {
        expect(describeValue({ type: 'text' }, '')).toBe('');
    });

    it('quotes a text value', () => {
        expect(describeValue({ type: 'text' }, 'ORD-1')).toBe('"ORD-1"');
    });

    it('describes a single status/enum value by its label', () => {
        const config: ColumnFilterConfig = {
            type: 'status',
            options: [{ value: 'paid', label: 'Paid', variant: 'success' }],
        };
        expect(describeValue(config, 'paid')).toBe('Paid');
        expect(describeValue(config, ['paid'])).toBe('Paid');
    });

    it('summarizes multiple selected status/enum values by count', () => {
        const config: ColumnFilterConfig = {
            type: 'status',
            options: [
                { value: 'paid', label: 'Paid', variant: 'success' },
                { value: 'pending', label: 'Pending', variant: 'warning' },
            ],
        };
        expect(describeValue(config, ['paid', 'pending'])).toBe('2 selected');
    });

    it('formats an amount-range value using the real ISO currency symbol', () => {
        const config: ColumnFilterConfig = { type: 'amount-range', currencyCode: 'USD' };
        expect(describeValue(config, { mode: 'more', min: 100 })).toBe('≥ $100');
        expect(describeValue(config, { mode: 'less', max: 50 })).toBe('≤ $50');
        expect(describeValue(config, { mode: 'range', min: 10, max: 20 })).toBe('$10–$20');
    });

    it('formats a date-range preset by its label, falling back to raw from/to', () => {
        const config: ColumnFilterConfig = { type: 'date-range' };
        expect(
            describeValue(config, { preset: 'custom', from: '2026-01-01', to: '2026-01-31' }),
        ).toBe('2026-01-01 – 2026-01-31');
    });
});

describe('closePrimeVueFilterOverlay', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('dispatches a click on document.body when document is available', () => {
        const click = vi.fn();
        vi.stubGlobal('document', { body: { click } });
        closePrimeVueFilterOverlay();
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('does nothing when document is unavailable (non-DOM environment)', () => {
        vi.stubGlobal('document', undefined);
        expect(() => closePrimeVueFilterOverlay()).not.toThrow();
    });
});
