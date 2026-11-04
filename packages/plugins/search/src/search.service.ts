import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { StockLevelService, StockTier } from '@mivend/plugin-reservation';
import { CatalogPricingService, DiscountTierVM, ResolvedPrice } from '@mivend/plugin-price-entry';

@Injectable()
export class SearchService {
    constructor(
        private catalogPricingService: CatalogPricingService,
        private stockLevelService: StockLevelService,
    ) {}

    async getResolvedPrice(ctx: RequestContext, variantId: string): Promise<ResolvedPrice> {
        return (await this.catalogPricingService.get(ctx, variantId)).price;
    }

    async getTiers(ctx: RequestContext, variantId: string): Promise<DiscountTierVM[]> {
        return (await this.catalogPricingService.get(ctx, variantId)).tiers;
    }

    async getStockLevel(ctx: RequestContext, variantId: string): Promise<StockTier> {
        return this.stockLevelService.getTier(ctx, variantId);
    }
}
