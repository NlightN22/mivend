import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { StockLevelService } from './stock-level.service';

// Overrides the Shop API's native ProductVariant.stockLevel (a sum over every location) with the
// viewer's branch tier, so product page, cart and widgets agree with search results.
@Resolver('ProductVariant')
export class ProductVariantStockResolver {
    constructor(private stockLevelService: StockLevelService) {}

    @ResolveField()
    async stockLevel(
        @Ctx() ctx: RequestContext,
        @Parent() variant: { id: string },
    ): Promise<string> {
        return this.stockLevelService.getTier(ctx, variant.id);
    }
}
