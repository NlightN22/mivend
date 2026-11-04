import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
import { SearchService } from '../../search.service';
import type { CatalogPricing, CatalogPricingService } from '@mivend/plugin-price-entry';
import type { StockLevelService } from '@mivend/plugin-reservation';

const mockCtx = {} as RequestContext;

const pricing = (value: CatalogPricing): CatalogPricingService =>
    ({ get: vi.fn(async () => value) }) as unknown as CatalogPricingService;

const stockService = (): StockLevelService =>
    ({ getTier: vi.fn(async () => 'LOW_STOCK') }) as unknown as StockLevelService;

describe('SearchService', () => {
    it('delegates the stock level to StockLevelService.getTier', async () => {
        const stock = stockService();
        const service = new SearchService(
            pricing({ price: { customerPrice: 1, compareAtPrice: null }, tiers: [] }),
            stock,
        );
        expect(await service.getStockLevel(mockCtx, 'v1')).toBe('LOW_STOCK');
        expect(stock.getTier).toHaveBeenCalledWith(mockCtx, 'v1');
    });

    it('reads price and tiers from the same shared catalog resolution', async () => {
        const tiers = [
            { percent: 5, minWeightKg: 10, minAmount: null, facetCode: 'c', facetValueCode: 'v' },
        ];
        const catalog = pricing({ price: { customerPrice: 900, compareAtPrice: 1000 }, tiers });
        const service = new SearchService(catalog, stockService());

        expect(await service.getResolvedPrice(mockCtx, 'v1')).toEqual({
            customerPrice: 900,
            compareAtPrice: 1000,
        });
        expect(await service.getTiers(mockCtx, 'v1')).toEqual(tiers);
        expect(catalog.get).toHaveBeenCalledWith(mockCtx, 'v1');
    });
});
