import { describe, expect, it } from 'vitest';
import {
    countComparisonView,
    differenceText,
    figureText,
    formatAge,
    formatAgeSeconds,
    isLagOverThreshold,
    pageOf,
    stockDefectsView,
    streamLags,
    totalOpen,
    unknownReasonKey,
} from '../../api/exchangeHealthView';

describe('exchange health view helpers', () => {
    it('flags a Kafka lag above 1000 and treats a missing lag as fine', () => {
        expect(isLagOverThreshold('1001')).toBe(true);
        expect(isLagOverThreshold('1000')).toBe(false);
        expect(isLagOverThreshold(null)).toBe(false);
    });

    it('formats ages in minutes, hours and days', () => {
        const now = Date.parse('2026-01-10T12:00:00Z');
        expect(formatAge('2026-01-10T11:30:00Z', now)).toBe('30 min');
        expect(formatAge('2026-01-10T07:00:00Z', now)).toBe('5 h');
        expect(formatAge('2026-01-07T12:00:00Z', now)).toBe('3 d');
        expect(formatAge(null, now)).toBe('—');
        expect(formatAgeSeconds(45)).toBe('45 s');
        expect(formatAgeSeconds(7200)).toBe('2 h');
        expect(formatAgeSeconds(null)).toBe('—');
    });

    it('sums open reports by severity and ignores non-numeric entries', () => {
        expect(totalOpen({ critical: 2, warning: 3, junk: 'x' })).toBe(5);
        expect(totalOpen(null)).toBe(0);
    });

    it('reads the count comparison and marks only an ok, differing stream', () => {
        const rows = countComparisonView({
            countComparison: [
                { stream: 'a', status: 'ok', mirrorCount: 5, expectedCount: 7, differing: true },
                { stream: 'b', status: 'error', mirrorCount: 1, expectedCount: 9, differing: true },
                { status: 'ok' },
            ],
        });
        expect(rows.map(r => [r.stream, r.differs])).toEqual([
            ['a', true],
            ['b', false],
        ]);
        expect(differenceText(5, 7)).toBe('-2');
        expect(differenceText(8, 7)).toBe('+1');
        expect(differenceText(7, 7)).toBe('—');
        expect(differenceText(null, 7)).toBe('—');
    });

    it('reads stream lags from the source summary', () => {
        const lags = streamLags({ streams: [{ stream: 'a', lagSeconds: 30 }, { stream: 1 }] });
        expect([...lags]).toEqual([['a', 30]]);
    });

    it('builds the stock defects view only from a complete mirror and flags a real difference', () => {
        const mirror = {
            negativeReserved: 1,
            availableExceedsQuantity: 0,
            negativeAvailable: 0,
            negativeQuantity: 0,
        };
        expect(stockDefectsView({ stockDefects: { mirror: { negativeReserved: 1 } } })).toBeNull();
        const view = stockDefectsView({
            stockDefects: {
                mirror,
                integrationService: { status: 'ok', counts: { ...mirror, negativeReserved: 4 } },
            },
        });
        expect(view?.rows.find(r => r.kind === 'negativeReserved')?.differs).toBe(true);
        expect(view?.rows.find(r => r.kind === 'negativeQuantity')?.differs).toBe(false);
    });

    it('shows a provider count, or cuts other figures to one line', () => {
        expect(figureText({ count: 12 })).toBe('12');
        expect(figureText('x'.repeat(80), 10)).toHaveLength(10);
        expect(figureText(null)).toBe('—');
    });

    it('maps an unknown exchange reason to a known key', () => {
        expect(unknownReasonKey('TIMEOUT')).toBe('TIMEOUT');
        expect(unknownReasonKey('SOMETHING')).toBe('OTHER');
        expect(unknownReasonKey(null)).toBe('OTHER');
    });
});

describe('pageOf', () => {
    const rows = Array.from({ length: 45 }, (_, i) => i + 1);

    it('cuts each page from the full list', () => {
        expect(pageOf(rows, 1, 20)).toEqual(rows.slice(0, 20));
        expect(pageOf(rows, 2, 20)).toEqual(rows.slice(20, 40));
        expect(pageOf(rows, 3, 20)).toEqual([41, 42, 43, 44, 45]);
    });

    it('returns nothing past the last page and treats page 0 as the first', () => {
        expect(pageOf(rows, 4, 20)).toEqual([]);
        expect(pageOf(rows, 0, 20)).toEqual(rows.slice(0, 20));
    });

    it('shows a short list whole', () => {
        expect(pageOf([1, 2, 3], 1, 20)).toEqual([1, 2, 3]);
    });
});
