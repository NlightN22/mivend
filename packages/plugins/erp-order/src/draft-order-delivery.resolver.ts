import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';

import { DraftOrderDeliveryService } from './draft-order-delivery.service';

@Resolver()
export class DraftOrderDeliveryResolver {
    constructor(private delivery: DraftOrderDeliveryService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.CreateOrder)
    async setDraftOrderTradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; tradingPointId?: ID | null },
    ): Promise<boolean> {
        await this.delivery.setTradingPoint(ctx, args.orderId, args.tradingPointId ?? null);
        return true;
    }
}
