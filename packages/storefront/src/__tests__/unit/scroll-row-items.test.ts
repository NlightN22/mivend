import { describe, expect, it } from 'vitest';
import { scrollRowItems } from '../../components/scroll-row-items';

describe('scrollRowItems', () => {
    it('shows each product once when the row fits without arrows', () => {
        expect(scrollRowItems([1, 2], 5)).toEqual([1, 2]);
        expect(scrollRowItems([1, 2, 3, 4, 5], 5)).toHaveLength(5);
    });

    it('repeats the list for the endless wrap once arrows exist', () => {
        expect(scrollRowItems([1, 2, 3, 4, 5, 6], 5)).toHaveLength(12);
    });

    it('returns an empty list for no products', () => {
        expect(scrollRowItems([], 5)).toEqual([]);
    });
});
