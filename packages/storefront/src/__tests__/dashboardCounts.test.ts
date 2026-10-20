import { describe, expect, it } from 'vitest';
import { countIssuedThisMonth, monthCountLabel } from '../pages/account/dashboardCounts';

const NOW = new Date(2026, 9, 20);

describe('dashboard documents-this-month count', () => {
    it('counts only documents issued in the current month', () => {
        const dates = [new Date(2026, 9, 3).toISOString(), new Date(2026, 8, 30).toISOString()];
        expect(countIssuedThisMonth(dates, 2, NOW)).toEqual({ count: 1, atLeast: false });
    });

    it('ignores the same month of another year', () => {
        expect(countIssuedThisMonth([new Date(2025, 9, 5).toISOString()], 1, NOW).count).toBe(0);
    });

    it('marks the count as a lower bound when the whole scanned page is this month', () => {
        const dates = [new Date(2026, 9, 9).toISOString(), new Date(2026, 9, 1).toISOString()];
        const value = countIssuedThisMonth(dates, 7, NOW);
        expect(value).toEqual({ count: 2, atLeast: true });
        expect(monthCountLabel(value)).toBe('2+');
    });

    it('is exact when every document was scanned', () => {
        expect(monthCountLabel(countIssuedThisMonth([], 0, NOW))).toBe('0');
    });
});
