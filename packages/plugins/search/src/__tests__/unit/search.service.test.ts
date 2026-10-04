import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
import { SearchService } from '../../search.service';
import type { PriceResolutionService, ResolvedPrice } from '@mivend/plugin-price-entry';
import type { StockLevelService } from '@mivend/plugin-reservation';

const mockCtx = {} as RequestContext;

function makePriceResolutionService(resolved: ResolvedPrice): PriceResolutionService {
    return {
        resolve: vi.fn(async () => resolved),
    } as unknown as PriceResolutionService;
}

function makeStockLevelService(): StockLevelService {
    return {
        getTiers: vi.fn(
            async (_ctx: unknown, ids: string[]) => new Map(ids.map(id => [id, 'LOW_STOCK'])),
        ),
    } as unknown as StockLevelService;
}

describe('SearchService', () => {
    describe('getStockLevel', () => {
        it('batches the field resolvers of one request into a single ATP lookup', async () => {
            const stock = makeStockLevelService();
            const service = new SearchService(
                makePriceResolutionService({ customerPrice: 1, compareAtPrice: null }),
                stock,
            );
            const ctx = {} as RequestContext;
            const levels = await Promise.all([
                service.getStockLevel(ctx, 'v1'),
                service.getStockLevel(ctx, 'v2'),
                service.getStockLevel(ctx, 'v1'),
            ]);
            expect(levels).toEqual(['LOW_STOCK', 'LOW_STOCK', 'LOW_STOCK']);
            expect(stock.getTiers).toHaveBeenCalledTimes(1);
            expect(stock.getTiers).toHaveBeenCalledWith(ctx, ['v1', 'v2']);
        });
    });

    describe('getResolvedPrice', () => {
        it('delegates to PriceResolutionService with correct variantId', async () => {
            const priceResolutionService = makePriceResolutionService({
                customerPrice: 1290,
                compareAtPrice: null,
            });
            const service = new SearchService(priceResolutionService, makeStockLevelService());

            const result = await service.getResolvedPrice(mockCtx, 'variant-42');

            expect(priceResolutionService.resolve).toHaveBeenCalledWith(mockCtx, 'variant-42');
            expect(result).toEqual({ customerPrice: 1290, compareAtPrice: null });
        });

        it('passes through a compareAtPrice when a discount is active', async () => {
            const priceResolutionService = makePriceResolutionService({
                customerPrice: 900,
                compareAtPrice: 1000,
            });
            const service = new SearchService(priceResolutionService, makeStockLevelService());

            const result = await service.getResolvedPrice(mockCtx, 'v1');

            expect(result).toEqual({ customerPrice: 900, compareAtPrice: 1000 });
        });
    });
});
