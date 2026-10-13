import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, Order, Payment, RequestContext, TransactionalConnection } from '@vendure/core';

import { isOrderCancellable } from './order-cancellation.decision';

@Resolver('Order')
export class OrderCancellableResolver {
    constructor(private connection: TransactionalConnection) {}

    @ResolveField()
    async cancellable(@Ctx() ctx: RequestContext, @Parent() order: Order): Promise<boolean> {
        if (order.customFields.isExternal) return false;
        const payments = await this.connection
            .getRepository(ctx, Payment)
            .find({ where: { order: { id: order.id } } });
        const fields = order.customFields;
        return isOrderCancellable({
            orderState: order.state,
            erpStatus: fields.erpStatus ?? null,
            erpOrderId: fields.erpOrderId ?? null,
            latestFulfillmentState: fields.latestFulfillmentState ?? null,
            hasSettledPayment: payments.some(p => p.state === 'Settled'),
            cancelRequestStatus: fields.cancelRequestStatus ?? null,
            submission: 'none',
            requestRegistered: true,
        });
    }
}
