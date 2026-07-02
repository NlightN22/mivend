import { OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, OrderPlacedEvent, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { ErpOrderStatusEvent } from './erp-order.events';
import { ErpOrderResolver } from './erp-order.resolver';
import { ErpOrderService } from './erp-order.service';
import { shopApiExtensions } from './api/shop.schema';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [ErpOrderService],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [ErpOrderResolver],
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
