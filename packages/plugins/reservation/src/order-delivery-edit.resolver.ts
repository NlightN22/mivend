import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { OrderDeliveryEditService } from './order-delivery-edit.service';
import type { OrderDeliveryMethod } from './order-delivery-edit.service';

@Resolver()
export class OrderDeliveryEditResolver {
    constructor(private delivery: OrderDeliveryEditService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ConfirmOrder.Permission)
    async setOrderDelivery(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; method: OrderDeliveryMethod; tradingPointId?: ID | null },
    ): Promise<boolean> {
        await this.delivery.setDelivery(
            ctx,
            args.orderId,
            args.method,
            args.tradingPointId ?? null,
        );
        return true;
    }
}
