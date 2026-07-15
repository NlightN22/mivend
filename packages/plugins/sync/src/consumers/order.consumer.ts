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
// What this does NOT do yet: apply the event on the receiving side. Decided: the receiving
// instance gets a FULL local Order copy (not a lighter fulfillment-only projection) — the whole
// point is that a branch (or Central) interacts with a synced order exactly like any other
// local order, through the same Vendure Order APIs. Status changes are themselves synced as
// order.updated events on the same object (same sourceInstanceId-owns-the-write-until-acked
// rule as creation). Applying this — actually writing the local Order — is not implemented yet;
// tracked alongside issue #43 (most SyncEventSchema event types still have no real outbound
// producer). This closes the producer half only.
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
            relations: ['lines', 'lines.productVariant', 'customer'],
        });
        if (!order) {
            this.logger.warn(`OrderReadyForErpEvent for missing order id=${event.orderId}`);
            return;
        }
        // This order is itself a replica received via sync (OrderSyncService stamps
        // sourceOrderId on write) — never re-publish it, or a Central↔Branch order would
        // ping-pong forever between the two instances.
        if (order.customFields.sourceOrderId) return;
        const customer = order.customer;
        if (!customer) {
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
                        sourceOrderId: String(order.id),
                        orderCode: order.code,
                        customerEmail: customer.emailAddress,
                        branchId: order.customFields.branchId ?? this.options.instanceId,
                        lines: order.lines.map(line => ({
                            sku: line.productVariant.sku,
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
