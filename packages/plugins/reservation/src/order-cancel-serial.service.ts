import { Injectable } from '@nestjs/common';
import type { CancelOrderInput } from '@vendure/common/lib/generated-types';
import {
    ErrorResultUnion,
    Order,
    OrderService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { withOrderCancelLocks } from 'shared';

type CancelOrderResult = ErrorResultUnion<Awaited<ReturnType<OrderService['cancelOrder']>>, Order>;

// Core's cancelOrder releases stock before it transitions, unlocked: two concurrent calls each
// release the allocation once. Serializing on the cancel locks makes a repeat see Cancelled.
@Injectable()
export class OrderCancelSerialService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
    ) {}

    async cancelOrder(ctx: RequestContext, input: CancelOrderInput): Promise<CancelOrderResult> {
        return withOrderCancelLocks(this.connection, ctx, input.orderId, async txCtx => {
            const order = await this.connection
                .getRepository(txCtx, Order)
                .findOne({ where: { id: input.orderId } });
            if (order?.state === 'Cancelled' && !input.lines?.length) return order;
            return this.orderService.cancelOrder(txCtx, input);
        });
    }
}
