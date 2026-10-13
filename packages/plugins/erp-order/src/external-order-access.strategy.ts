import type { Order, OrderByCodeAccessStrategy, RequestContext } from '@vendure/core';

// External orders have no customer, so the default strategy would expose them by code to any
// anonymous caller within its time window; they are listed only through myOrders.
export class ExternalOrderAccessStrategy implements OrderByCodeAccessStrategy {
    constructor(private readonly inner: OrderByCodeAccessStrategy) {}

    canAccessOrder(ctx: RequestContext, order: Order): boolean | Promise<boolean> {
        if (order.customFields?.isExternal === true) return false;
        return this.inner.canAccessOrder(ctx, order);
    }
}
