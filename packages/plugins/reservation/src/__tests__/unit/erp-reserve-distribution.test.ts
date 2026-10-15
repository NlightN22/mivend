import { describe, expect, it } from 'vitest';
import { distributeErpReserve } from '../../erp-reserve-distribution';

describe('distributeErpReserve', () => {
    const lines = [
        { id: '12', quantity: 2 },
        { id: '11', quantity: 5 },
    ];

    it('fills lines in id order up to their quantity', () => {
        expect([...distributeErpReserve(lines, 6)]).toEqual([
            ['11', 5],
            ['12', 1],
        ]);
    });

    it('leaves lines beyond the reserved quantity unreserved', () => {
        expect([...distributeErpReserve(lines, 3)]).toEqual([['11', 3]]);
    });

    it('puts a surplus over all line quantities on the last line', () => {
        expect(distributeErpReserve(lines, 10).get('12')).toBe(5);
    });

    it('returns nothing without lines', () => {
        expect(distributeErpReserve([], 4).size).toBe(0);
    });
});
