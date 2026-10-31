import { describe, expect, it } from 'vitest';

import {
    countEntries,
    formatLag,
    healthVariant,
    livenessOnlyTypes,
    streamLags,
    toReportFilter,
    totalOpen,
} from '../../consistency-display';

describe('consistency display helpers', () => {
    it('maps health to a badge variant', () => {
        expect(healthVariant('ok')).toBe('secondary');
        expect(healthVariant('stale')).toBe('destructive');
        expect(healthVariant('no-check-yet')).toBe('outline');
    });

    it('sorts counts and ignores non-numbers', () => {
        expect(countEntries({ a: 1, b: 5, c: 'x' })).toEqual([
            ['b', 5],
            ['a', 1],
        ]);
        expect(countEntries(null)).toEqual([]);
    });

    it('sums open counts', () => {
        const s = {
            health: 'ok',
            summary: null,
            localOpenByType: {},
            localOpenBySeverity: { critical: 2, warning: 3 },
        };
        expect(totalOpen(s)).toBe(5);
    });

    it('reads stream lags defensively', () => {
        expect(streamLags({ streams: [{ stream: 'p', lagSeconds: 3 }, { bad: 1 }] })).toEqual([
            { stream: 'p', lagSeconds: 3 },
        ]);
        expect(streamLags(null)).toEqual([]);
    });

    it('formats lag', () => {
        expect(formatLag(30)).toBe('30 s');
        expect(formatLag(600)).toBe('10 min');
        expect(formatLag(7200)).toBe('2.0 h');
    });

    it('unwraps list filters and defaults status to open', () => {
        expect(toReportFilter(undefined).status).toBe('open');
        const f = toReportFilter({
            _and: [
                { severity: ['critical'] },
                { status: ['all'] },
                { entityType: { contains: 'stock' } },
            ],
        });
        expect(f).toMatchObject({ severity: 'critical', status: 'all', entityType: 'stock' });
    });

    it('picks the liveness-only types that the provider covers', () => {
        expect(livenessOnlyTypes(['stock', 'price', 'category'])).toEqual(['price', 'category']);
        expect(livenessOnlyTypes([])).toEqual([]);
    });
});
