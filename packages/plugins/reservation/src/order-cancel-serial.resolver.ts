import { Args, Mutation, Resolver } from '@nestjs/graphql';
import type { CancelOrderInput } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';

import { OrderCancelSerialService } from './order-cancel-serial.service';

// Overrides core's Admin API cancelOrder (same field name) so Dashboard cancels are serialized.
@Resolver()
export class AdminVendureCancelOrderResolver {
    constructor(private serial: OrderCancelSerialService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async cancelOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: CancelOrderInput },
    ): ReturnType<OrderCancelSerialService['cancelOrder']> {
        return this.serial.cancelOrder(ctx, args.input);
    }
}
