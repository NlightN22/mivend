import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { OrdersAttention, OrdersAttentionService } from './orders-attention.service';

@Resolver()
export class OrdersAttentionResolver {
    constructor(private attention: OrdersAttentionService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async ordersAttention(
        @Ctx() ctx: RequestContext,
        @Args() args: { overdueBefore: Date },
    ): Promise<OrdersAttention> {
        return this.attention.load(ctx, args.overdueBefore);
    }
}
