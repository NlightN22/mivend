import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    FulfillmentStateTransitionEvent,
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
    exports: [ErpOrderService, OrderVisibilityService],
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
        //
        // `Draft` must trigger the same denormalization as `AddingItems`: an admin-created draft
        // order (manager portal's /orders/new, or any admin API `createDraftOrder` flow) never
        // passes through `AddingItems` at all — it starts in `Draft` and transitions straight to
        // `ArrangingPayment`. Missing this meant every admin-created order left
        // `customFields.branchId` null forever, silently hiding it from every department-scoped
        // viewer (confirmed real incident: e2e's `createConfirmedOrder` helper, which uses this
        // exact admin draft-order path, produced orders invisible to department-scoped roles).
        subscribeAndLog(
            this.eventBus,
            OrderStateTransitionEvent,
            event => {
                if (event.fromState !== 'AddingItems' && event.fromState !== 'Draft') {
                    return Promise.resolve();
                }
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
            FulfillmentStateTransitionEvent,
            event => this.erpOrderService.onFulfillmentStateChanged(event.ctx, event.fulfillment),
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
