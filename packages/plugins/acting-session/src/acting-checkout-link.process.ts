import './acting-session.types';
import {
    CustomerService,
    Injector,
    Order,
    OrderProcess,
    OrderState,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

// Links the acting cart to the customer for payment only, and unlinks it when checkout is left, so an abandoned cart is never the customer's.
export class ActingCheckoutLinkProcess implements OrderProcess<OrderState> {
    private connection!: TransactionalConnection;
    private customers!: CustomerService;

    init(injector: Injector): void {
        this.connection = injector.get(TransactionalConnection);
        this.customers = injector.get(CustomerService);
    }

    async onTransitionStart(
        fromState: OrderState,
        toState: OrderState,
        data: { ctx: RequestContext; order: Order },
    ): Promise<void> {
        const { ctx, order } = data;
        if (!order.customFields?.actingSessionId) return;
        const repo = this.connection.getRepository(ctx, Order);
        if (toState === 'ArrangingPayment' && !order.customerId && ctx.activeUserId) {
            const customer = await this.customers.findOneByUserId(ctx, ctx.activeUserId);
            if (!customer) return;
            await repo.update(order.id, { customer: { id: customer.id } });
            order.customer = customer;
            order.customerId = customer.id;
        } else if (toState === 'AddingItems' && fromState === 'ArrangingPayment') {
            await repo.createQueryBuilder().relation(Order, 'customer').of(order.id).set(null);
            order.customer = undefined;
            order.customerId = undefined as never;
        }
    }
}
