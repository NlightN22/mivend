import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventBus, Order } from '@vendure/core';
import { OrderReadyForErpEvent } from '@mivend/plugin-erp-order';

import { SyncService } from '../sync.service';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';

// Writes an order.created outbox entry on every placed order — direction follows the instance
// of origin, not a fixed rule (see docs/architecture.md's "Orders: direction follows the
// instance of origin"):
//   - Placed on Central (customer via the public Storefront, or a remote manager connected
//     directly to Central) → target is the order's own servicing branch
//     (Order.customFields.branchId, denormalized from the customer's preferred TradingPoint —
//     see ErpOrderService.onOrderPlaced) so that branch can reserve stock and fulfill it.
//   - Placed on a Branch (a local operator, including fully offline) → target is 'central' for
//     aggregation/reporting, matching the pre-existing Branch → Central → ERP flow.
//
// What this does NOT do yet: apply the event on the receiving side (create a local record a
// branch or Central would act on). That's a genuine open design question — does a branch need a
// full local copy of the Order, or a lighter fulfillment-only projection (order code, lines,
// branchId)? — not yet decided, tracked alongside issue #43 (most SyncEventSchema event types
// still have no real outbound producer). This closes the producer half only.
@Injectable()
export class OrderConsumer implements OnApplicationBootstrap {
    private readonly logger = new Logger(OrderConsumer.name);

    constructor(
        private readonly eventBus: EventBus,
        private readonly dataSource: DataSource,
        private readonly syncService: SyncService,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        this.eventBus.ofType(OrderReadyForErpEvent).subscribe(event => this.handle(event));
    }

    private async handle(event: OrderReadyForErpEvent): Promise<void> {
        const order = await this.dataSource.getRepository(Order).findOne({
            where: { id: event.orderId },
            relations: ['lines'],
        });
        if (!order) {
            this.logger.warn(`OrderReadyForErpEvent for missing order id=${event.orderId}`);
            return;
        }
        if (!order.customerId) {
            this.logger.warn(`Order ${order.code} has no customer — skipping sync`);
            return;
        }

        const isCentralOrigin = this.options.instanceType === 'central';
        const target = isCentralOrigin
            ? (order.customFields.branchId ?? 'all-branches')
            : 'central';

        await this.dataSource.transaction(em =>
            this.syncService.writeToOutbox(
                em,
                {
                    eventType: 'order.created',
                    payload: {
                        orderId: String(order.id),
                        customerId: String(order.customerId),
                        branchId: order.customFields.branchId ?? this.options.instanceId,
                        lines: order.lines.map(line => ({
                            variantId: String(line.productVariantId),
                            quantity: line.quantity,
                            unitPrice: line.proratedUnitPriceWithTax,
                        })),
                    },
                },
                target,
            ),
        );
        this.logger.log(`Order ${order.code} queued for sync (target=${target})`);
    }
}
