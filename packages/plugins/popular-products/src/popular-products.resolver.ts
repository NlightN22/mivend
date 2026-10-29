import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { HomeWidgetIdsService } from './home-widget-ids.service';
import { PopularProductsService } from './popular-products.service';

@Resolver()
export class PopularProductsResolver {
    constructor(
        private popularProductsService: PopularProductsService,
        private homeWidgetIds: HomeWidgetIdsService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    async popularProductIds(
        @Ctx() ctx: RequestContext,
        @Args() args: { take?: number },
    ): Promise<string[]> {
        return this.popularProductsService.getPopularProductIds(ctx, args.take);
    }

    @Query()
    @Allow(Permission.Public)
    async newArrivalProductIds(
        @Ctx() ctx: RequestContext,
        @Args() args: { take?: number; sinceDays?: number },
    ): Promise<string[]> {
        return this.homeWidgetIds.newArrivalProductIds(ctx, args.take, args.sinceDays);
    }

    @Query()
    @Allow(Permission.Public)
    async saleProductIds(
        @Ctx() ctx: RequestContext,
        @Args() args: { take?: number },
    ): Promise<string[]> {
        return this.homeWidgetIds.saleProductIds(ctx, args.take);
    }
}
