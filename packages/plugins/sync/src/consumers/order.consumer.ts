import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
    EventBus,
    Order,
    OrderStateTransitionEvent,
    PaymentStateTransitionEvent,
} from '@vendure/core';
import { OrderReadyForErpEvent } from '@mivend/plugin-erp-order';

import { registerOutboxProducer } from '../producer-registry';
import { SyncService } from '../sync.service';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';
import type { OutboxEntry } from '../producer-registry';

// Writes order.created/order.updated outbox entries — direction follows the instance of origin,
// not a fixed rule (see docs/architecture.md's "Orders: direction follows the instance of
// origin"):
//   - Placed on Central (customer via the public Storefront, or a remote manager connected
//     directly to Central) → target is the order's own servicing branch
//     (Order.customFields.branchId, denormalized from the customer's preferred TradingPoint —
//     see ErpOrderService.onOrderPlaced) so that branch can reserve stock and fulfill it.
//   - Placed on a Branch (a local operator, including fully offline) → target is 'central' for
//     aggregation/reporting, matching the pre-existing Branch → Central → ERP flow.
//
// The receiving instance gets a FULL local Order copy (not a lighter fulfillment-only
// projection) — the whole point is that a branch (or Central) interacts with a synced order
// exactly like any other local order, through the same Vendure Order APIs.
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
        registerOutboxProducer(
            this.eventBus,
            this.dataSource,
            this.syncService,
            OrderReadyForErpEvent,
            event => this.toOrderCreatedEntry(event),
        );

        // OrderStateTransitionEvent fires for every subsequent status change (payment
        // authorized, shipped, cancelled, ...). Deliberately skips the very first transition out
        // of 'AddingItems' — that one fires *before* OrderPlacedEvent in the same
        // OrderService.transitionToState call (verified against @vendure/core's
        // order.service.js), so an order.updated for it would race order.created to the
        // receiving instance and very likely arrive first, hitting OrderSyncService.applyUpdate's
        // "no local replica found" no-op. order.created's own payload now carries the order's
        // placed state instead (see OrderCreatedPayload.state), so nothing is lost by skipping
        // it here.
        registerOutboxProducer(
            this.eventBus,
            this.dataSource,
            this.syncService,
            OrderStateTransitionEvent,
            event => this.toOrderUpdatedEntry(event),
        );

        // A payment fact — see docs/architecture.md's "Order as a read-model: independent event
        // streams per concern (CQRS)". Fires for a REAL Vendure payment on THIS instance's own
        // order (never a replica — ReplicaOrderProcess blocks a real Payment from ever being
        // added to one). Skips the sync path's own re-application of an incoming
        // `payment.recorded` fact (OrderSyncService.applyPaymentRecorded always uses a system
        // context with no `activeUserId` — see requestContextService.create({apiType:'admin'})),
        // or its own `.echo` would ping-pong the same fact back out.
        registerOutboxProducer(
            this.eventBus,
            this.dataSource,
            this.syncService,
            PaymentStateTransitionEvent,
            event => this.toPaymentRecordedEntry(event),
        );
    }

    private async toOrderCreatedEntry(event: OrderReadyForErpEvent): Promise<OutboxEntry | null> {
        const order = await this.dataSource.getRepository(Order).findOne({
            where: { id: event.orderId },
            relations: ['lines', 'lines.productVariant', 'customer'],
        });
        if (!order) {
            this.logger.warn(`OrderReadyForErpEvent for missing order id=${event.orderId}`);
            return null;
        }
        // This order is itself a replica received via sync (OrderSyncService stamps
        // sourceOrderId on write) — never re-publish it, or a Central↔Branch order would
        // ping-pong forever between the two instances.
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
        // 'Created' → 'AddingItems' fires internally for every single order the moment it's
        // instantiated (OrderService.create()), including abandoned carts that never place an
        // order — not sync-worthy. 'AddingItems' → * (the actual placement transition) is
        // skipped for the ordering-race reason documented below.
        if (event.fromState === 'Created' || event.fromState === 'AddingItems') return null;
        const order = event.order;
        // Same guard as order.created, but note the asymmetry it introduces: a status change
        // applied to a *replica* (e.g. a branch operator confirming/shipping a Central-origin
        // order) is never re-published here, because doing so with no reentrancy marker would
        // ping-pong forever (Central applies it → its own OrderStateTransitionEvent fires →
        // would re-publish back to the branch → ...). Bidirectional status sync for a replica's
        // own transitions is therefore not implemented — tracked as part of the still-undesigned
        // "order conflict/race resolution" item (see docs/ai/PROJECT_CONTEXT.md), not guessed at
        // here. Only a non-replica order's own transitions are synced.
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

        // System context (OrderSyncService applying an incoming fact for real) vs. a genuine
        // witnessed payment (a real checkout, or an operator's recordWitnessedPayment call) —
        // see this method's call site comment for why this matters.
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
