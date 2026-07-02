import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PriceResolutionService, ResolvedPrice } from '@mivend/plugin-price-entry';

@Injectable()
export class SearchService {
    constructor(private priceResolutionService: PriceResolutionService) {}

    async getResolvedPrice(ctx: RequestContext, variantId: string): Promise<ResolvedPrice> {
        return this.priceResolutionService.resolve(ctx, variantId);
    }
}
