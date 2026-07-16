import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    OrderPlacedEvent,
    OrderStateTransitionEvent,
    PluginCommonModule,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { subscribeAndLog } from 'shared';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { ErpOrderStatusEvent } from './erp-order.events';
import { ErpOrderResolver } from './erp-order.resolver';
import { AdminOrderVisibilityResolver } from './admin-order-visibility.resolver';
import { ErpOrderService } from './erp-order.service';
import { OrderVisibilityService } from './order-visibility.service';
import { shopApiExtensions } from './api/shop.schema';

const adminApiSchema = gql`
    extend type Query {
        visibleOrders(
            options: OrderListOptions
            managerId: ID
            customerId: ID
            search: String
        ): OrderList!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, CounterpartyPlugin],
    providers: [ErpOrderService, OrderVisibilityService],
    exports: [ErpOrderService],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [ErpOrderResolver],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [AdminOrderVisibilityResolver],
    },
    compatibility: '>0.0.0',
})
export class ErpOrderPlugin implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly erpOrderService: ErpOrderService,
    ) {}

    onApplicationBootstrap(): void {
        // Branches must see "their" customers' orders regardless of payment status (decided
        // 2026-07-16, see docs/architecture.md) — Vendure's own `OrderPlacedEvent` only fires
        // once a payment has already been authorized/settled
        // (`DefaultOrderPlacedStrategy.shouldSetAsPlaced` requires
        // `ArrangingPayment→PaymentAuthorized/PaymentSettled`), which is too late for that. This
        // now ALSO fires on the earlier, payment-independent `AddingItems→*` transition (the
        // first time an order leaves the cart), which is when a customer/address/trading-point
        // are normally already attached. `OrderPlacedEvent` is kept as a second, later trigger —
        // `onOrderPlaced` is idempotent-safe to call twice (denormalizes the same fields, and
        // downstream `order.created` sync absorbs a duplicate via its own sourceOrderId check),
        // and covers stragglers (e.g. a guest customer only attached to the order later in
        // checkout than `ArrangingPayment`).
        subscribeAndLog(
            this.eventBus,
            OrderStateTransitionEvent,
            event => {
                if (event.fromState !== 'AddingItems') return Promise.resolve();
                return this.erpOrderService.onOrderPlaced(event.ctx, event.order);
            },
            'ErpOrderPlugin',
        );

        subscribeAndLog(
            this.eventBus,
            OrderPlacedEvent,
            event => this.erpOrderService.onOrderPlaced(event.ctx, event.order),
            'ErpOrderPlugin',
        );

        subscribeAndLog(
            this.eventBus,
            ErpOrderStatusEvent,
            event =>
                this.erpOrderService.updateStatus(event.ctx, {
                    orderCode: event.orderCode,
                    status: event.status,
                    erpOrderId: event.erpOrderId,
                }),
            'ErpOrderPlugin',
        );
    }
}
