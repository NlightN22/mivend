import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { StockLevelService, StockTier } from '@mivend/plugin-reservation';
import { DiscountTierVM, PriceResolutionService, ResolvedPrice } from '@mivend/plugin-price-entry';

@Injectable()
export class SearchService {
    constructor(
        private priceResolutionService: PriceResolutionService,
        private stockLevelService: StockLevelService,
    ) {}

    async getResolvedPrice(ctx: RequestContext, variantId: string): Promise<ResolvedPrice> {
        return this.priceResolutionService.resolve(ctx, variantId);
    }

    async getTiers(ctx: RequestContext, variantId: string): Promise<DiscountTierVM[]> {
        return this.priceResolutionService.resolveTiers(ctx, variantId);
    }

    async getStockLevel(ctx: RequestContext, variantId: string): Promise<StockTier> {
        return this.stockLevelService.getTier(ctx, variantId);
    }
}
