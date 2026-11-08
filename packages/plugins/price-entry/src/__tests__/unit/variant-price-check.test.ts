import { describe, expect, it, vi } from 'vitest';

import { VariantPriceCheck } from '../../variant-price-check';

const ctx = {} as never;
const order = { id: '5' } as never;

function build(price: number | null) {
    const resolve = vi.fn(async () => ({ customerPrice: price, compareAtPrice: null }));
    return { check: new VariantPriceCheck({ resolve } as never), resolve };
}

describe('VariantPriceCheck', () => {
    it('quotes with the order rules and the requested quantity so tier prices apply', async () => {
        const { check, resolve } = build(900);
        expect(await check.quote(ctx, order, '7', 100)).toEqual({
            customerPrice: 900,
            referencePrice: 900,
        });
        expect(resolve).toHaveBeenCalledWith(ctx, '7', { order, quantity: 100 });
    });

    it('has no quote without a customer price', async () => {
        expect(await build(null).check.quote(ctx, order, '7', 1)).toBeNull();
    });

    it('checks for a price without the order rules', async () => {
        const { check, resolve } = build(900);
        expect(await check.hasCustomerPrice(ctx, order, '7')).toBe(true);
        expect(resolve).toHaveBeenCalledWith(
            ctx,
            '7',
            { order, quantity: 1 },
            { orderRules: false },
        );
    });
});
