import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { PackagingLevelView } from './product-packaging-levels.service';
import { SearchResultPackagingLevelsService } from './search-result-packaging-levels.service';

@Resolver('SearchResult')
export class SearchResultPackagingLevelsResolver {
    constructor(private readonly levelsService: SearchResultPackagingLevelsService) {}

    @ResolveField()
    packagingLevels(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productId: string },
    ): Promise<PackagingLevelView[]> {
        return this.levelsService.load(ctx, String(result.productId));
    }
}
