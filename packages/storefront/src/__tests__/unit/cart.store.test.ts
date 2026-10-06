import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@mivend/ui-kit', () => ({ toast: vi.fn() }));
vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));

import { shopApi } from '../../api/client';
import { useCartStore } from '../../stores/cart';
import { AdjustCartLineDocument } from '../../api/generated/graphql';

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

describe('cart store fetchCart', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        vi.mocked(shopApi).mockReset();
    });

    it('keeps the known cart when the fetch fails, then recovers on retry', async () => {
        const store = useCartStore();
        setLines(store, [
            { quantity: 4, unitPrice: 100, compareAtPrice: null, linePriceWithTax: 400 },
        ]);
        vi.mocked(shopApi)
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce({
                activeOrder: { lines: [{ quantity: 6 }] },
            } as never);

        await store.fetchCart();
        expect(store.totalQuantity).toBe(4);

        await vi.advanceTimersByTimeAsync(2000);
        expect(store.totalQuantity).toBe(6);
        vi.useRealTimers();
    });

    it('is not loaded until a fetch succeeds, so an unfetched cart never reads as empty', async () => {
        const store = useCartStore();
        vi.mocked(shopApi)
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce({ activeOrder: null } as never);
        expect(store.loaded).toBe(false);

        await store.fetchCart();
        expect(store.loaded).toBe(false);

        await vi.advanceTimersByTimeAsync(2000);
        expect(store.loaded).toBe(true);
        vi.useRealTimers();
    });
});

describe('cart store mutation queue', () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const adjustCalls: Array<{ lineId: string; qty: number }> = [];

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useRealTimers();
        inFlight = 0;
        maxInFlight = 0;
        adjustCalls.length = 0;
        vi.mocked(shopApi).mockReset();
        vi.mocked(shopApi).mockImplementation((async (doc: unknown, vars?: unknown) => {
            if (doc === AdjustCartLineDocument) {
                adjustCalls.push(vars as { lineId: string; qty: number });
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise(resolve => setTimeout(resolve, 5));
                inFlight--;
                return { adjustOrderLine: { __typename: 'Order' } };
            }
            return { activeOrder: null };
        }) as never);
    });

    function twoLineCart(store: ReturnType<typeof useCartStore>): void {
        store.order = {
            lines: ['a', 'b'].map(id => ({
                id,
                quantity: 1,
                linePrice: 100,
                linePriceWithTax: 100,
            })),
        } as never;
    }

    it('never runs adjusts of different lines in parallel', async () => {
        const store = useCartStore();
        twoLineCart(store);

        await Promise.all([store.adjustItem('a', 2), store.adjustItem('b', 3)]);

        expect(adjustCalls).toEqual([
            { lineId: 'a', qty: 2 },
            { lineId: 'b', qty: 3 },
        ]);
        expect(maxInFlight).toBe(1);
    });

    it('collapses rapid adjusts of one line into the latest quantity', async () => {
        const store = useCartStore();
        twoLineCart(store);

        await Promise.all([
            store.adjustItem('a', 2),
            store.adjustItem('a', 3),
            store.adjustItem('a', 4),
        ]);

        expect(adjustCalls).toEqual([{ lineId: 'a', qty: 4 }]);
    });

    it('keeps the optimistic quantity while mutations are pending', async () => {
        const store = useCartStore();
        twoLineCart(store);

        const pending = store.adjustItem('a', 5);
        expect(store.lines.find(l => l.id === 'a')?.quantity).toBe(5);
        await pending;
    });

    it('restarts the debounce on every click, so a slow burst is one request', async () => {
        vi.useFakeTimers();
        const store = useCartStore();
        twoLineCart(store);

        const first = store.adjustItem('a', 2);
        await vi.advanceTimersByTimeAsync(200);
        const second = store.adjustItem('a', 3);
        await vi.advanceTimersByTimeAsync(200);
        expect(adjustCalls).toEqual([]);

        await vi.advanceTimersByTimeAsync(400);
        await Promise.all([first, second]);
        expect(adjustCalls).toEqual([{ lineId: 'a', qty: 3 }]);
        vi.useRealTimers();
    });
});
