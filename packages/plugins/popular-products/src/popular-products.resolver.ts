import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { PopularProductsService } from './popular-products.service';

@Resolver()
export class PopularProductsResolver {
    constructor(private popularProductsService: PopularProductsService) {}

    @Query()
    @Allow(Permission.Public)
    async popularProductIds(
        @Ctx() ctx: RequestContext,
        @Args() args: { take?: number },
    ): Promise<string[]> {
        return this.popularProductsService.getPopularProductIds(ctx, args.take);
    }
}
