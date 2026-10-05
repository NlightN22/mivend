import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@mivend/ui-kit', () => ({ toast: vi.fn() }));
vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));

import { useCartStore } from '../../stores/cart';

interface TestLine {
    quantity: number;
    unitPrice: number | null;
    compareAtPrice: number | null;
    linePriceWithTax: number;
}

function setLines(store: ReturnType<typeof useCartStore>, lines: TestLine[]): void {
    store.order = { lines } as never;
}

describe('cart store totals', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('totalQuantity sums line quantities, not the number of lines', () => {
        const store = useCartStore();
        setLines(store, [
            { quantity: 1, unitPrice: 100, compareAtPrice: null, linePriceWithTax: 100 },
            { quantity: 4, unitPrice: 100, compareAtPrice: null, linePriceWithTax: 400 },
        ]);

        expect(store.itemCount).toBe(2);
        expect(store.totalQuantity).toBe(5);
    });

    it('discountAmount adds back each discounted line, rounded to whole kopecks', () => {
        const store = useCartStore();
        setLines(store, [
            // 10% off: paid 9000, list 10000 -> discount 1000
            { quantity: 1, unitPrice: 9000, compareAtPrice: 10000, linePriceWithTax: 9000 },
            // fractional: 3 x 333 paid, list 400 -> 999 * (67/333) = 201.0 rounds per line
            { quantity: 3, unitPrice: 333, compareAtPrice: 400, linePriceWithTax: 999 },
        ]);

        expect(store.discountAmount).toBe(1000 + Math.round(999 * (67 / 333)));
        expect(Number.isInteger(store.discountAmount)).toBe(true);
    });

    it('ignores lines without a list price or with a zero unit price', () => {
        const store = useCartStore();
        setLines(store, [
            { quantity: 1, unitPrice: 100, compareAtPrice: null, linePriceWithTax: 100 },
            { quantity: 1, unitPrice: 0, compareAtPrice: 50, linePriceWithTax: 0 },
            { quantity: 1, unitPrice: null, compareAtPrice: 50, linePriceWithTax: 0 },
        ]);

        expect(store.discountAmount).toBe(0);
    });
});
