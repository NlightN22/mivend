import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceAdjustmentResolver } from '../../price-adjustment.resolver';

describe('PriceAdjustmentResolver floor queries', () => {
    const ctx = {} as RequestContext;
    const floor = { forVariants: vi.fn(async () => new Map([['v1', 150]])) };
    const resolver = new PriceAdjustmentResolver({} as never, floor as never);

    it('floorPrice returns the derived floor, null when unknown', async () => {
        expect(await resolver.floorPrice(ctx, { variantId: 'v1' })).toBe(150);
        expect(await resolver.floorPrice(ctx, { variantId: 'v2' })).toBeNull();
    });

    it('floorPrice finds the floor when the id argument arrives as a number', async () => {
        const numeric = new Map([['1', 150]]);
        const resolver = new PriceAdjustmentResolver(
            {} as never,
            { forVariants: vi.fn(async () => numeric) } as never,
        );
        expect(await resolver.floorPrice(ctx, { variantId: 1 })).toBe(150);
    });

    it('floorPricesForVariants maps the derived floors', async () => {
        expect(await resolver.floorPricesForVariants(ctx, { variantIds: ['v1'] })).toEqual([
            { variantId: 'v1', price: 150 },
        ]);
    });
});
