import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
import { SearchService } from '../../search.service';
import type { PriceResolutionService, ResolvedPrice } from '@mivend/plugin-price-entry';

const mockCtx = {} as RequestContext;

function makePriceResolutionService(resolved: ResolvedPrice): PriceResolutionService {
    return {
        resolve: vi.fn(async () => resolved),
    } as unknown as PriceResolutionService;
}

describe('SearchService', () => {
    describe('getResolvedPrice', () => {
        it('delegates to PriceResolutionService with correct variantId', async () => {
            const priceResolutionService = makePriceResolutionService({
                customerPrice: 1290,
                compareAtPrice: null,
            });
            const service = new SearchService(priceResolutionService);

            const result = await service.getResolvedPrice(mockCtx, 'variant-42');

            expect(priceResolutionService.resolve).toHaveBeenCalledWith(mockCtx, 'variant-42');
            expect(result).toEqual({ customerPrice: 1290, compareAtPrice: null });
        });

        it('passes through a compareAtPrice when a discount is active', async () => {
            const priceResolutionService = makePriceResolutionService({
                customerPrice: 900,
                compareAtPrice: 1000,
            });
            const service = new SearchService(priceResolutionService);

            const result = await service.getResolvedPrice(mockCtx, 'v1');

            expect(result).toEqual({ customerPrice: 900, compareAtPrice: 1000 });
        });
    });
});
