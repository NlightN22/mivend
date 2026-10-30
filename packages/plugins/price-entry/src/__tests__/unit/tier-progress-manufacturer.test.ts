import { ProductVariant, RequestContext } from '@vendure/core';
import { describe, expect, it } from 'vitest';

import { toFacetsAndWeight } from '../../order-preload';
import { TierProgressService } from '../../tier-progress.service';
import type { OrderPricingContext } from '../../price-resolution.service';

const ctx = { languageCode: 'en' } as unknown as RequestContext;

describe('tier progress for a manufacturer-scoped ladder', () => {
    it('names the progress after the synthetic manufacturer entry and sums the brand lines', async () => {
        const variant = {
            facetValues: [],
            customFields: { weight: 1 },
            product: {
                facetValues: [],
                customFields: { manufacturer: { externalId: 'maker-1', name: 'Maker One' } },
            },
        } as unknown as ProductVariant;
        const resolution = {
            forVariant: async () => 50_000,
            getVariantFacetsAndWeight: async () => toFacetsAndWeight(ctx, variant),
        };
        const rules = {
            getTiers: async (_c: unknown, _p: string, facetValues: Array<{ facetCode: string }>) =>
                facetValues.some(f => f.facetCode === 'manufacturer')
                    ? [
                          {
                              percent: 5,
                              minWeightKg: null,
                              minAmount: 100_000,
                              facetCode: 'manufacturer',
                              facetValueCode: 'maker-1',
                          },
                          {
                              percent: 10,
                              minWeightKg: null,
                              minAmount: 200_000,
                              facetCode: 'manufacturer',
                              facetValueCode: 'maker-1',
                          },
                      ]
                    : [],
        };
        const service = new TierProgressService(
            { getPriceTypeCodeForUser: async () => 'WHOLESALE' } as never,
            rules as never,
            resolution as never,
        );
        const orderContext = {
            quantity: 3,
            order: { lines: [{ productVariantId: 'v1', quantity: 3 }] },
        } as unknown as OrderPricingContext;

        const progress = await service.resolveTierProgress(ctx, 'v1', orderContext);

        expect(progress).toEqual({
            facetName: 'Maker One',
            metric: 'AMOUNT',
            current: 150_000,
            currentPercent: 5,
            nextThreshold: 200_000,
            nextPercent: 10,
        });
    });
});
