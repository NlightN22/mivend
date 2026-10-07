import { describe, expect, it } from 'vitest';

import { formatAge, isLagOverThreshold } from '../../stream-health-view';

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
