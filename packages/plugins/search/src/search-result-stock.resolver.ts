import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, ProductVariantService, RequestContext } from '@vendure/core';

// Temporary, not branch-scoped: replaced by the branch-scoped stockLevel tier.
@Resolver('SearchResult')
export class ExternalSearchResultStockResolver {
    constructor(private variantService: ProductVariantService) {}

    @ResolveField()
    async inStock(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<boolean> {
        const variant = await this.variantService.findOne(ctx, result.productVariantId);
        if (!variant) return false;
        return (await this.variantService.getSaleableStockLevel(ctx, variant)) > 0;
    }
}
