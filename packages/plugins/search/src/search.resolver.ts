import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import type { DiscountTierVM } from '@mivend/plugin-price-entry';
import { SearchService } from './search.service';

@Resolver('SearchResult')
export class SearchResultResolver {
    constructor(private searchService: SearchService) {}

    @ResolveField()
    async customerPrice(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<number | null> {
        return (await this.searchService.getResolvedPrice(ctx, result.productVariantId))
            .customerPrice;
    }

    @ResolveField()
    async compareAtPrice(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<number | null> {
        return (await this.searchService.getResolvedPrice(ctx, result.productVariantId))
            .compareAtPrice;
    }

    @ResolveField()
    async discountTiers(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<DiscountTierVM[]> {
        return this.searchService.getTiers(ctx, result.productVariantId);
    }
}
