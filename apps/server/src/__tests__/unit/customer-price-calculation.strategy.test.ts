import { describe, expect, it, vi } from 'vitest';
import type { Order, ProductVariant, RequestContext } from '@vendure/core';

import { CustomerPriceCalculationStrategy } from '../../customer-price-calculation.strategy';

function build() {
    const resolve = vi.fn(async () => ({ customerPrice: 900, compareAtPrice: 1000 }));
    const preload = vi.fn(async () => undefined);
    const strategy = new CustomerPriceCalculationStrategy();
    (strategy as unknown as { priceResolutionService: unknown }).priceResolutionService = {
        resolve,
        preload,
    };
    return { strategy, resolve, preload };
}

const variant = (id: number) =>
    ({ id, listPrice: 5, listPriceIncludesTax: false }) as unknown as ProductVariant;
const orderOf = (id: number, lines: number): Order =>
    ({ id, lines: Array.from({ length: lines }, (_, i) => ({ id: i })) }) as unknown as Order;

describe('CustomerPriceCalculationStrategy repricing', () => {
    it('preloads once per order and ctx and hands every line the same memo', async () => {
        const { strategy, resolve, preload } = build();
        const ctx = {} as RequestContext;
        const order = orderOf(1, 3);
        for (let i = 1; i <= 3; i++)
            await strategy.calculateUnitPrice(ctx, variant(i), {}, order, 1);

        expect(preload).toHaveBeenCalledTimes(1);
        const calls = resolve.mock.calls as unknown as Array<
            [unknown, unknown, unknown, { memo: unknown }]
        >;
        expect(new Set(calls.map(c => c[3].memo)).size).toBe(1);
        expect(calls[0][3]).toMatchObject({ orderRules: false });
    });

    it('never shares a memo between two requests', async () => {
        const { strategy, resolve, preload } = build();
        const order = orderOf(1, 2);
        await strategy.calculateUnitPrice({} as RequestContext, variant(1), {}, order, 1);
        await strategy.calculateUnitPrice({} as RequestContext, variant(1), {}, order, 1);
        const calls = resolve.mock.calls as unknown as Array<
            [unknown, unknown, unknown, { memo: unknown }]
        >;
        expect(calls[0][3].memo).not.toBe(calls[1][3].memo);
        expect(preload).toHaveBeenCalledTimes(2);
    });

    it('preloads again when the order gained a line', async () => {
        const { strategy, preload } = build();
        const ctx = {} as RequestContext;
        await strategy.calculateUnitPrice(ctx, variant(1), {}, orderOf(1, 1), 1);
        await strategy.calculateUnitPrice(ctx, variant(2), {}, orderOf(1, 2), 1);
        expect(preload).toHaveBeenCalledTimes(2);
    });

    it('skips every lookup for a manual unit price', async () => {
        const { strategy, resolve, preload } = build();
        const result = await strategy.calculateUnitPrice(
            {} as RequestContext,
            variant(1),
            { manualUnitPrice: 777 },
            orderOf(1, 1),
            1,
        );
        expect(result.price).toBe(777);
        expect(resolve).not.toHaveBeenCalled();
        expect(preload).not.toHaveBeenCalled();
    });

    it('lets a failing preload reject the pricing', async () => {
        const { strategy, preload } = build();
        preload.mockRejectedValueOnce(new Error('db down'));
        await expect(
            strategy.calculateUnitPrice({} as RequestContext, variant(1), {}, orderOf(1, 1), 1),
        ).rejects.toThrow('db down');
    });
});
