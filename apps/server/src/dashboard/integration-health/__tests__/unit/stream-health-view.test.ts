import { describe, expect, it } from 'vitest';

import {
    formatAge,
    schemaSourceBadge,
    formatVariantOrganizationLine,
    formatVariantUnitLine,
    isLagOverThreshold,
    isRejectedOrderCountOverThreshold,
    outboundTypesWith,
} from '../../stream-health-view';

describe('isLagOverThreshold', () => {
    it('is false for unknown, at-threshold and small lag', () => {
        expect(isLagOverThreshold(null)).toBe(false);
        expect(isLagOverThreshold('1000')).toBe(false);
        expect(isLagOverThreshold('0')).toBe(false);
    });

    it('is true above the threshold, including values beyond Number precision', () => {
        expect(isLagOverThreshold('1001')).toBe(true);
        expect(isLagOverThreshold('9007199254740993')).toBe(true);
    });
});

describe('isRejectedOrderCountOverThreshold', () => {
    it('is false at zero, true on any positive count', () => {
        expect(isRejectedOrderCountOverThreshold(0)).toBe(false);
        expect(isRejectedOrderCountOverThreshold(1)).toBe(true);
        expect(isRejectedOrderCountOverThreshold(42)).toBe(true);
    });
});

describe('formatAge', () => {
    const now = Date.parse('2026-01-02T00:00:00Z');

    it('renders minutes, hours and days', () => {
        expect(formatAge('2026-01-01T23:30:00Z', now)).toBe('30 min');
        expect(formatAge('2026-01-01T18:00:00Z', now)).toBe('6 h');
        expect(formatAge('2025-12-30T00:00:00Z', now)).toBe('3 d');
    });

    it('renders a dash when there is no pending row', () => {
        expect(formatAge(null, now)).toBe('—');
    });
});

describe('outboundTypesWith', () => {
    const rows = [
        { eventType: 'a', failed: 1, skipped: 0 },
        { eventType: 'b', failed: 0, skipped: 2 },
        { eventType: 'c', failed: 0, skipped: 0 },
    ];

    it('lists the event types with a non-zero count for the given key', () => {
        expect(outboundTypesWith(rows, 'failed')).toEqual(['a']);
        expect(outboundTypesWith(rows, 'skipped')).toEqual(['b']);
    });
});

describe('formatVariantOrganizationLine', () => {
    it('is a problem when some variants have no organization', () => {
        expect(formatVariantOrganizationLine({ total: 120, withoutOrganization: 7 })).toEqual({
            text: '7 of 120 enabled variants have no organization and cannot be ordered',
            problem: true,
        });
    });

    it('is neutral at zero', () => {
        expect(formatVariantOrganizationLine({ total: 120, withoutOrganization: 0 }).problem).toBe(
            false,
        );
    });
});

describe('formatVariantUnitLine', () => {
    it('warns when some variants wait for their unit and is neutral at zero', () => {
        expect(formatVariantUnitLine({ total: 400, unitMissing: 3 })).toEqual({
            text: '3 of 400 variants reference a unit that has not arrived',
            problem: true,
        });
        expect(formatVariantUnitLine({ total: 400, unitMissing: 0 }).problem).toBe(false);
    });
});

describe('schemaSourceBadge', () => {
    it('is neutral for the contract package and outlined for the local copy', () => {
        expect(schemaSourceBadge('contract')?.variant).toBe('secondary');
        expect(schemaSourceBadge('local')).toMatchObject({
            label: 'Local copy',
            variant: 'outline',
        });
    });

    it('shows nothing when the source is unknown', () => {
        expect(schemaSourceBadge(null)).toBeNull();
        expect(schemaSourceBadge(undefined)).toBeNull();
    });
});
