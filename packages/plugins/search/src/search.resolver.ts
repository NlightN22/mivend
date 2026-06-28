import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import { SearchService } from './search.service';

@Resolver('SearchResult')
export class SearchResultResolver {
    constructor(private searchService: SearchService) {}

    @ResolveField()
    async customerPrice(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<number | null> {
        return this.searchService.getCustomerPrice(ctx, result.productVariantId);
    }
}
