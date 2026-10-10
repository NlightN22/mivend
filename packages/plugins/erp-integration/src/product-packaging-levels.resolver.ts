import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import {
    ProductPackagingLevelsService,
    PackagingLevelView,
} from './product-packaging-levels.service';

@Resolver('Product')
export class ProductPackagingLevelsResolver {
    constructor(private readonly packagingLevelsService: ProductPackagingLevelsService) {}

    @ResolveField()
    packagingLevels(
        @Ctx() ctx: RequestContext,
        @Parent() product: { id: string },
    ): Promise<PackagingLevelView[]> {
        return this.packagingLevelsService.getForProduct(ctx, product.id);
    }
}
