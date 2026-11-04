import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CatalogPricing } from '../../catalog-pricing.service';
import { ProductVariantPriceResolver } from '../../price-entry.resolver';

describe('ProductVariant catalog price fields', () => {
    it('read price, compare-at price and tiers through the one shared catalog resolution', async () => {
        const pricing: CatalogPricing = {
            price: { customerPrice: 900, compareAtPrice: 1000 },
            tiers: [],
        };
        const get = vi.fn(async () => pricing);
        const resolver = new ProductVariantPriceResolver(
            {} as never,
            {} as never,
            {} as never,
            { get } as never,
        );
        const ctx = { activeUserId: 7 } as RequestContext;

        expect(await resolver.customerPrice(ctx, { id: '1' })).toBe(900);
        expect(await resolver.compareAtPrice(ctx, { id: '1' })).toBe(1000);
        expect(await resolver.discountTiers(ctx, { id: '1' })).toBe(pricing.tiers);
        expect(get).toHaveBeenCalledTimes(3);
        expect(get).toHaveBeenCalledWith(ctx, '1');
    });
});
