import { Injectable } from '@nestjs/common';
import type { CancelOrderInput } from '@vendure/common/lib/generated-types';
import {
    ErrorResultUnion,
    Order,
    OrderService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { withAggregateLock } from 'shared';

type CancelOrderResult = ErrorResultUnion<Awaited<ReturnType<OrderService['cancelOrder']>>, Order>;

// Core's cancelOrder releases stock before it transitions, unlocked: two concurrent calls each
// release the allocation once. Serializing on reserveOrder's lock makes a repeat see Cancelled.
@Injectable()
export class OrderCancelSerialService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
    ) {}

    async cancelOrder(ctx: RequestContext, input: CancelOrderInput): Promise<CancelOrderResult> {
        return withAggregateLock(
            this.connection,
            ctx,
            `reserve-order:${input.orderId}`,
            async txCtx => {
                const order = await this.connection
                    .getRepository(txCtx, Order)
                    .findOne({ where: { id: input.orderId } });
                if (order?.state === 'Cancelled' && !input.lines?.length) return order;
                return this.orderService.cancelOrder(txCtx, input);
            },
        );
    }
}
