import { OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, OrderPlacedEvent, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { ErpOrderController } from './erp-order.controller';
import { ErpOrderService } from './erp-order.service';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [ErpOrderService],
    controllers: [ErpOrderController],
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
    }
}
