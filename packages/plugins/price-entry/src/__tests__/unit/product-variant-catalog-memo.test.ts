import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { DiscountSetupRulesService } from '../../discount-setup-rules.service';
import { ProductVariantPriceResolver } from '../../price-entry.resolver';
import { PriceResolutionService } from '../../price-resolution.service';

describe('ProductVariant catalog price fields', () => {
    it('share one lookup memo: recipient rules load once and each variant is read once for N variants and 2 fields', async () => {
        const ruleQueries = vi.fn(async () => []);
        const variantReads = vi.fn(async () => ({
            facetValues: [],
            product: { facetValues: [], customFields: { externalId: 'p' } },
            customFields: { weight: 0 },
        }));
        const connection = {
            getRepository: (_ctx: unknown, entity: { name?: string }) =>
                entity.name === 'ProductVariant'
                    ? { findOne: variantReads }
                    : { query: ruleQueries },
        };
        const resolution = new PriceResolutionService(
            {
                getPriceTypeCodeForUser: async () => 'RETAIL',
                getPriceTypeCodeById: async () => 'RETAIL',
                getForVariant: async () => 1000,
            } as never,
            { getBestPercent: async () => null } as never,
            connection as never,
            { findOneByUserId: async () => ({ id: 1 }) } as never,
            { getForCustomer: async () => ({ id: 1, erpId: 'cnt-1', branchId: null }) } as never,
            { resolveEffective: async () => null } as never,
            { getBestPromoPercent: async () => null } as never,
            new DiscountSetupRulesService(connection as never),
        );
        const resolver = new ProductVariantPriceResolver(
            resolution,
            {} as never,
            {} as never,
            {} as never,
        );
        const ctx = { activeUserId: 7 } as RequestContext;
        const ids = ['1', '2', '3', '4', '5'];

        for (const id of ids) {
            await resolver.customerPrice(ctx, { id });
            await resolver.compareAtPrice(ctx, { id });
        }

        expect(ruleQueries).toHaveBeenCalledTimes(1);
        expect(variantReads).toHaveBeenCalledTimes(ids.length * 2);
    });
});
