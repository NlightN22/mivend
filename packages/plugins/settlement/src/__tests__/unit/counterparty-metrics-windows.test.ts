import { describe, expect, it } from 'vitest';

import { averageCheck, computeWindows } from '../../counterparty-metrics.windows';

describe('computeWindows', () => {
    it('uses local calendar days in UTC and includes today in the last 30 days', () => {
        const w = computeWindows(new Date('2026-11-12T15:30:00Z'), 'UTC');
        expect(w.endExclusive.toISOString()).toBe('2026-11-13T00:00:00.000Z');
        expect(w.last30Start.toISOString()).toBe('2026-10-14T00:00:00.000Z');
        expect(w.prev30Start.toISOString()).toBe('2026-09-14T00:00:00.000Z');
        expect(w.last12Start.toISOString()).toBe('2025-11-13T00:00:00.000Z');
    });

    it('moves day boundaries with the time zone (local date differs from the UTC date)', () => {
        const w = computeWindows(new Date('2026-11-12T22:30:00Z'), 'Asia/Tokyo');
        expect(w.endExclusive.toISOString()).toBe('2026-11-13T15:00:00.000Z');
        expect(w.last30Start.toISOString()).toBe('2026-10-14T15:00:00.000Z');
    });

    it('follows daylight saving: boundaries keep local midnight', () => {
        const w = computeWindows(new Date('2026-11-12T12:00:00Z'), 'Europe/Berlin');
        expect(w.endExclusive.toISOString()).toBe('2026-11-12T23:00:00.000Z');
        expect(w.last30Start.toISOString()).toBe('2026-10-13T22:00:00.000Z');
    });
});

describe('averageCheck', () => {
    it('divides net turnover by the sale document count and rounds', () => {
        expect(averageCheck(1000, 3)).toBe(333);
        expect(averageCheck(-50, 1)).toBe(-50);
    });

    it('is null with zero documents', () => {
        expect(averageCheck(500, 0)).toBeNull();
    });
});
