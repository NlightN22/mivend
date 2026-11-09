import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, Order, RequestContext } from '@vendure/core';
import { Counterparty } from '@mivend/plugin-counterparty';

import { OrderCounterpartyLoader } from './order-counterparty.loader';

// Reachable only through an order the caller may read; the nested Counterparty fields apply their own hiding.
@Resolver('Order')
export class AdminOrderCounterpartyResolver {
    constructor(private loader: OrderCounterpartyLoader) {}

    @ResolveField()
    counterparty(@Ctx() ctx: RequestContext, @Parent() order: Order): Promise<Counterparty | null> {
        return this.loader.forOrder(ctx, order.id);
    }
}
