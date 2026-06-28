import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
import { SearchService } from '../../search.service';
import type { PriceEntryService } from '@mivend/plugin-price-entry';

const mockCtx = {} as RequestContext;

function makePriceEntryService(priceTypeCode: string | null, price: number | null) {
    return {
        getPriceTypeCodeForUser: vi.fn(async () => priceTypeCode),
        getForVariant: vi.fn(async () => price),
    } as unknown as PriceEntryService;
}

describe('SearchService', () => {
    let service: SearchService;

    describe('getCustomerPrice', () => {
        it('returns null when user has no price type', async () => {
            service = new SearchService(makePriceEntryService(null, null));

            const result = await service.getCustomerPrice(mockCtx, 'v1');

            expect(result).toBeNull();
        });

        it('returns price from PriceEntryService when price type exists', async () => {
            service = new SearchService(makePriceEntryService('WHOLESALE', 1290));

            const result = await service.getCustomerPrice(mockCtx, 'v1');

            expect(result).toBe(1290);
        });

        it('returns null when price type exists but no price entry', async () => {
            service = new SearchService(makePriceEntryService('WHOLESALE', null));

            const result = await service.getCustomerPrice(mockCtx, 'v1');

            expect(result).toBeNull();
        });

        it('delegates to PriceEntryService with correct variantId', async () => {
            const priceEntryService = makePriceEntryService('RETAIL', 500);
            service = new SearchService(priceEntryService);

            await service.getCustomerPrice(mockCtx, 'variant-42');

            expect(priceEntryService.getForVariant).toHaveBeenCalledWith(
                mockCtx,
                'variant-42',
                'RETAIL',
            );
        });
    });
});
