import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    Order,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    OrderStateTransitionEvent,
    PaymentStateTransitionEvent,
} from '@vendure/core';
import { OrderReadyForErpEvent } from '@mivend/plugin-erp-order';

import { registerOutboxProducer } from '../producer-registry';
import { SyncService } from '../sync.service';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';
import type { OutboxEntry } from '../producer-registry';

// Direction follows the origin instance: Central-placed orders go to the servicing branch,
// branch-placed orders to 'central'. Receiver gets a full copy so Vendure Order APIs work as-is.
@Injectable()
export class OrderConsumer implements OnApplicationBootstrap {
    private readonly logger = new Logger(OrderConsumer.name);

    constructor(
        private readonly eventBus: EventBus,
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        private readonly syncService: SyncService,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        const deps = {
            eventBus: this.eventBus,
            connection: this.connection,
            requestContextService: this.requestContextService,
            syncService: this.syncService,
        };
        registerOutboxProducer(deps, OrderReadyForErpEvent, (ctx, event) =>
            this.toOrderCreatedEntry(ctx, event),
        );

        // The first AddingItems exit fires before OrderPlacedEvent, so its order.updated would race
        // order.created and hit the no-replica no-op; order.created already carries the placed state.
        registerOutboxProducer(deps, OrderStateTransitionEvent, (_ctx, event) =>
            this.toOrderUpdatedEntry(event),
        );

        // Skip sync re-application of incoming payment.recorded (system context, no activeUserId):
        // otherwise its own .echo would ping-pong the same fact back out.
        registerOutboxProducer(deps, PaymentStateTransitionEvent, (_ctx, event) =>
            this.toPaymentRecordedEntry(event),
        );
    }

    private async toOrderCreatedEntry(
        ctx: RequestContext,
        event: OrderReadyForErpEvent,
    ): Promise<OutboxEntry | null> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: event.orderId },
            relations: ['lines', 'lines.productVariant', 'customer'],
        });
        if (!order) {
            this.logger.warn(`OrderReadyForErpEvent for missing order id=${event.orderId}`);
            return null;
        }
        // Never re-publish a replica (one received via sync, stamped with sourceOrderId):
        // a Central<->Branch order would ping-pong forever between the two instances.
        if (order.customFields.sourceOrderId) return null;
        const customer = order.customer;
        if (!customer) {
            this.logger.warn(`Order ${order.code} has no customer — skipping sync`);
            return null;
        }

        const target = this.resolveTarget(order);
        this.logger.log(`Order ${order.code} queued for sync (target=${target})`);
        return {
            eventType: 'order.created',
            target,
            payload: {
                sourceOrderId: String(order.id),
                orderCode: order.code,
                customerEmail: customer.emailAddress,
                branchId: order.customFields.branchId ?? this.options.instanceId,
                state: order.state,
                lines: order.lines.map(line => ({
                    sku: line.productVariant.sku,
                    quantity: line.quantity,
                    unitPrice: line.proratedUnitPriceWithTax,
                })),
            },
        };
    }

    private toOrderUpdatedEntry(event: OrderStateTransitionEvent): OutboxEntry | null {
        // 'Created' -> 'AddingItems' fires for every instantiated order, including abandoned carts;
        // AddingItems -> * is skipped: it would race order.created to the receiver.
        if (event.fromState === 'Created' || event.fromState === 'AddingItems') return null;
        const order = event.order;
        // Only non-replica transitions are synced: re-publishing a replica's own transitions has no
        // reentrancy marker and would ping-pong between instances.
        if (order.customFields.sourceOrderId) return null;

        const target = this.resolveTarget(order);
        this.logger.log(
            `Order ${order.code} status change (${event.fromState} → ${event.toState}) queued for sync (target=${target})`,
        );
        return {
            eventType: 'order.updated',
            target,
            payload: {
                sourceOrderId: String(order.id),
                state: event.toState,
            },
        };
    }

    private toPaymentRecordedEntry(event: PaymentStateTransitionEvent): OutboxEntry | null {
        if (event.toState !== 'Authorized' && event.toState !== 'Settled') return null;

        const order = event.order;
        // Defense-in-depth: a real Payment should never exist on a replica at all (blocked by
        // ReplicaOrderProcess), but skip explicitly rather than assume.
        if (order.customFields.sourceOrderId) return null;

        // Sync-applied facts run in system context and must not count as witnessed payments;
        // only real checkouts and operator recordWitnessedPayment calls do.
        if (event.ctx.apiType === 'admin' && !event.ctx.activeUserId) return null;

        const target = this.resolveTarget(order);
        this.logger.log(
            `Order ${order.code} payment ${event.toState} (method=${event.payment.method}) queued for sync (target=${target})`,
        );
        return {
            eventType: 'payment.recorded',
            target,
            payload: {
                sourceOrderId: String(order.id),
                method: event.payment.method,
                amount: event.payment.amount,
                state: event.toState,
                witnessedBy: this.options.instanceId,
            },
        };
    }

    private resolveTarget(order: Order): string {
        const isCentralOrigin = this.options.instanceType === 'central';
        return isCentralOrigin ? (order.customFields.branchId ?? 'all-branches') : 'central';
    }
}
