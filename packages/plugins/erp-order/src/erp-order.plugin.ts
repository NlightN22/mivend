import { OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, OrderPlacedEvent, PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';
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
        this.eventBus.ofType(OrderPlacedEvent).subscribe(event => {
            void this.erpOrderService.onOrderPlaced(event.ctx, event.order);
        });

        this.eventBus.ofType(ErpOrderStatusEvent).subscribe(event => {
            void this.erpOrderService.updateStatus(event.ctx, {
                orderCode: event.orderCode,
                status: event.status,
                erpOrderId: event.erpOrderId,
            });
        });
    }
}
