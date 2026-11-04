import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { PackagingLevelView } from './product-packaging-levels.service';
import { SearchResultPackagingLevelsService } from './search-result-packaging-levels.service';

@Resolver('Product')
export class ProductPackagingLevelsResolver {
    constructor(private readonly batchedLevels: SearchResultPackagingLevelsService) {}

    @ResolveField()
    packagingLevels(
        @Ctx() ctx: RequestContext,
        @Parent() product: { id: string },
    ): Promise<PackagingLevelView[]> {
        return this.batchedLevels.load(ctx, String(product.id));
    }
}
