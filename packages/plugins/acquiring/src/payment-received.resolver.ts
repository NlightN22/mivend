import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Order, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { PaymentReceivedService } from './payment-received.service';

@Resolver()
export class PaymentReceivedResolver {
    constructor(private paymentReceived: PaymentReceivedService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ConfirmPaymentReceived.Permission)
    confirmPaymentReceived(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<Order> {
        return this.paymentReceived.confirm(ctx, args.orderId);
    }
}
