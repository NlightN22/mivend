import { describe, expect, it } from 'vitest';
import { fitColumnWidths, type FitColumn } from '../../utils/fitColumnWidths';

const COLS: FitColumn[] = [
    { field: 'a', width: 100, minWidth: 100, priority: 3 },
    { field: 'b', width: 100, priority: 2 },
    { field: 'c', width: 100, priority: 1 },
    { field: 'd', width: 100, priority: 1 },
];

describe('fitColumnWidths', () => {
    it('keeps every width when the columns fit', () => {
        const { widths, dropped } = fitColumnWidths(COLS, 400);
        expect([...widths.values()]).toEqual([100, 100, 100, 100]);
        expect(dropped.size).toBe(0);
    });

    it('shrinks the lowest priority first, later column on a tie', () => {
        const { widths } = fitColumnWidths(COLS, 350);
        expect(widths.get('d')).toBe(72);
        expect(widths.get('c')).toBe(78);
        expect(widths.get('a')).toBe(100);
        expect(widths.get('b')).toBe(100);
    });

    it('never shrinks a column below its minWidth and drops the lowest priority when still too wide', () => {
        const { widths, dropped } = fitColumnWidths(COLS, 220);
        expect(widths.get('a')).toBe(100);
        expect([...dropped]).toEqual(['d', 'c']);
        expect(widths.get('b')).toBe(72);
    });

    it('does nothing when no column has a priority', () => {
        const plain = COLS.map(({ priority: _p, ...c }) => c);
        expect([...fitColumnWidths(plain, 100).widths.values()]).toEqual([100, 100, 100, 100]);
    });
});
