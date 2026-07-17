import { Inject, Injectable } from '@nestjs/common';
import {
    isGraphQlErrorResult,
    Logger,
    Order,
    OrderService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { DataSource } from 'typeorm';
import type { ID, OrderState } from '@vendure/core';
import type { SyncEventByType } from 'shared';

import { SyncService } from './sync.service';
import { SYNC_PLUGIN_OPTIONS } from './types';
import type { SyncPluginOptions } from './types';

const loggerCtx = 'OrderSyncService';

// Applies a synced order.created/.updated event on the receiving instance — see
// docs/architecture.md's "receiving instance gets a full local Order copy". Goes through
// Vendure's real OrderService (create + addItemToOrder + transitionToState) rather than raw
// entity inserts: OrderLine has several Vendure-computed fields (taxLines, adjustments, prices)
// that only its own pricing/tax pipeline can populate correctly — a raw INSERT would either
// violate NOT NULL constraints or silently produce a line with no real price/tax calculation.
// Customer and ProductVariant are resolved by their existing stable, ERP-sourced identifiers
// (emailAddress, sku) — see shared/src/sync.ts's OrderCreatedPayload comment for why no new
// correlation field was needed for either.
@Injectable()
export class OrderSyncService {
    constructor(
        private readonly orderService: OrderService,
        private readonly requestContextService: RequestContextService,
        private readonly dataSource: DataSource,
        private readonly syncService: SyncService,
        private readonly connection: TransactionalConnection,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
    ) {}

    async applyCreate(event: SyncEventByType<'order.created'>): Promise<void> {
        const { payload } = event;

        const existing: Array<{ id: string }> = await this.dataSource.query(
            `SELECT id FROM "order" WHERE "customFieldsSourceorderid" = $1`,
            [payload.sourceOrderId],
        );
        if (existing[0]) return; // already applied — idempotent

        const ctx = await this.requestContextService.create({ apiType: 'admin' });

        const customerRows: Array<{ userId: string }> = await this.dataSource.query(
            `SELECT "userId" FROM customer WHERE "emailAddress" = $1 LIMIT 1`,
            [payload.customerEmail],
        );
        const userId = customerRows[0]?.userId;
        if (!userId) {
            Logger.warn(
                `Cannot apply order.created [${payload.sourceOrderId}] — no local customer for email=${payload.customerEmail}`,
                loggerCtx,
            );
            return;
        }

        const order = await this.orderService.create(ctx, userId);

        for (const line of payload.lines) {
            const variantRows: Array<{ id: string }> = await this.dataSource.query(
                `SELECT id FROM product_variant WHERE sku = $1 LIMIT 1`,
                [line.sku],
            );
            const variantId = variantRows[0]?.id;
            if (!variantId) {
                Logger.warn(
                    `order.created [${payload.sourceOrderId}] line skipped — no local variant for sku=${line.sku}`,
                    loggerCtx,
                );
                continue;
            }
            await this.orderService.addItemToOrder(ctx, order.id, variantId, line.quantity);
        }

        await this.dataSource.getRepository(Order).update(order.id, {
            customFields: { sourceOrderId: payload.sourceOrderId, branchId: payload.branchId },
        });

        // Bring the replica to the same state the source order was in when it was queued for
        // sync (e.g. 'ArrangingPayment'/'PaymentAuthorized') — without this it would stay stuck
        // in 'AddingItems' forever, since order.created never transitions the order itself, only
        // creates it. Best-effort: a failed transition is logged, not fatal — the replica still
        // exists and can be inspected/corrected manually.
        // Known live-verified limitation: Vendure's own state-machine guards reject a direct
        // jump into a payment-gated state (e.g. 'PaymentAuthorized' requires an actual
        // `Payment` entity with state 'Authorized' attached to the order — see
        // default-order-process.js's checkPaymentsCoverTotal guard) or a shipping-gated one
        // ('ArrangingPayment' requires shippingLines). Payments and shipping lines are not
        // synced today, so replaying a payment/shipping-gated target state on the replica will
        // reliably fail this check and log a warning, leaving the replica one step behind
        // ('AddingItems' or whatever earlier state it could legally reach). Not designed around
        // yet — would need either syncing Payment/ShippingLine records too, or treating the
        // origin's state as informational metadata rather than driving the replica's own real
        // Vendure order FSM.
        if (payload.state && payload.state !== 'AddingItems') {
            const result = await this.orderService.transitionToState(
                ctx,
                order.id,
                payload.state as OrderState,
            );
            if ('errorCode' in result) {
                Logger.warn(
                    `order.created [${payload.sourceOrderId}] created but failed to reach state ${payload.state}: ${result.message}`,
                    loggerCtx,
                );
            }
        }

        Logger.info(
            `Applied order.created [${payload.sourceOrderId}] as local order ${order.code}`,
            loggerCtx,
        );
    }

    async applyUpdate(event: SyncEventByType<'order.updated'>): Promise<void> {
        const { payload } = event;
        const rows: Array<{ id: string }> = await this.dataSource.query(
            `SELECT id FROM "order" WHERE "customFieldsSourceorderid" = $1`,
            [payload.sourceOrderId],
        );
        const orderId = rows[0]?.id;
        if (!orderId) {
            // Thrown, not swallowed: order.updated for the very first post-placement transition
            // can race its own order.created to this instance (see order.consumer.ts's producer
            // comment on why) — the replica this update targets may simply not exist *yet*, not
            // never. Throwing routes this through RabbitMQService.subscribe's existing
            // backoff-then-DLQ retry (AGENTS.md sync rule #4, "no silent drops"): a few retries
            // give order.created's slower delivery chain time to land; if the replica genuinely
            // never gets created (e.g. order.created itself failed to resolve a customer/variant
            // — see applyCreate above), this correctly ends up in the DLQ for inspection instead
            // of vanishing silently, which is what the old warn-and-return did.
            throw new Error(
                `Cannot apply order.updated [${payload.sourceOrderId}] — no local replica found (yet)`,
            );
        }

        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const result = await this.orderService.transitionToState(
            ctx,
            orderId,
            payload.state as OrderState,
        );
        if ('errorCode' in result) {
            Logger.warn(
                `order.updated [${payload.sourceOrderId}] transition to ${payload.state} failed: ${result.message}`,
                loggerCtx,
            );
        }
    }

    // Applies a `payment.recorded` fact — see docs/architecture.md's "Order as a read-model:
    // independent event streams per concern (CQRS)" and AGENTS.md sync rule #10. Two cases,
    // never a third: either this instance holds only a replica of the order (apply as an
    // informational projection, never touch the real Vendure order), or this instance owns the
    // order for real (apply it as a genuine payment through the normal Vendure API).
    async applyPaymentRecorded(event: SyncEventByType<'payment.recorded'>): Promise<void> {
        const { payload } = event;

        const replicaRows: Array<{ id: string }> = await this.dataSource.query(
            `SELECT id FROM "order" WHERE "customFieldsSourceorderid" = $1`,
            [payload.sourceOrderId],
        );
        if (replicaRows[0]) {
            await this.dataSource.getRepository(Order).update(replicaRows[0].id, {
                customFields: { paymentStatus: payload.state },
            });
            Logger.info(
                `Applied payment.recorded [${payload.sourceOrderId}] as an informational projection (replica)`,
                loggerCtx,
            );
            return;
        }

        const ownRows: Array<{ id: string }> = await this.dataSource.query(
            `SELECT id FROM "order" WHERE id::text = $1 AND "customFieldsSourceorderid" IS NULL`,
            [payload.sourceOrderId],
        );
        const orderId = ownRows[0]?.id;
        if (!orderId) {
            // Same reasoning as applyUpdate's throw above — the replica this fact is about may
            // simply not have landed yet (order.created racing ahead of it), so retry via the
            // existing backoff-then-DLQ machinery rather than dropping it silently.
            throw new Error(
                `Cannot apply payment.recorded [${payload.sourceOrderId}] — no matching local order (replica or origin) found (yet)`,
            );
        }

        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        // OrderService.addPaymentToOrder requires an open transaction (asserted internally) —
        // unlike create/addItemToOrder/transitionToState above, which don't. Found live
        // 2026-07-15: without this, every payment.recorded lands in the DLQ with
        // "must be called within a transaction".
        await this.connection.withTransaction(ctx, async txCtx => {
            const result = await this.orderService.addPaymentToOrder(txCtx, orderId, {
                method: payload.method,
                metadata: { witnessedBy: payload.witnessedBy },
            });
            if (isGraphQlErrorResult(result)) {
                Logger.warn(
                    `payment.recorded [${payload.sourceOrderId}] failed to apply as a real payment: ${result.message}`,
                    loggerCtx,
                );
            } else {
                Logger.info(
                    `Applied payment.recorded [${payload.sourceOrderId}] as a real payment (method=${payload.method})`,
                    loggerCtx,
                );
            }
        });
    }

    // The entry point for a payment witnessed *locally* on an order this instance may or may not
    // own — e.g. a branch till/kassa integration reporting cash paid for a Central-origin
    // replica it's servicing. Never mutates a replica's real Vendure order directly (blocked by
    // ReplicaOrderProcess anyway, see replica-order.guard.ts) — only ever writes the fact to the
    // outbox for the true owner to apply. If this instance IS the owner, applies it immediately
    // for real; the existing PaymentStateTransitionEvent producer (order.consumer.ts) then
    // reports it onward to the other side automatically.
    async recordWitnessedPayment(
        ctx: RequestContext,
        orderId: ID,
        method: string,
        amount: number,
        invoiceId?: number,
        outcome?: 'success' | 'pending' | 'fail' | 'cancel',
        rrn?: string,
    ): Promise<void> {
        const order = await this.dataSource
            .getRepository(Order)
            .findOne({ where: { id: orderId } });
        if (!order) {
            throw new UserInputError(`Order not found: id=${String(orderId)}`);
        }

        if (!order.customFields.sourceOrderId) {
            const result = await this.orderService.addPaymentToOrder(ctx, order.id, {
                method,
                metadata: {},
            });
            if (isGraphQlErrorResult(result)) {
                throw new UserInputError(result.message);
            }
            return;
        }

        const target =
            this.options.instanceType === 'branch'
                ? 'central'
                : (order.customFields.branchId ?? 'all-branches');
        await this.dataSource.transaction(em =>
            this.syncService.writeToOutbox(
                em,
                {
                    eventType: 'payment.recorded',
                    payload: {
                        sourceOrderId: order.customFields.sourceOrderId as string,
                        method,
                        amount,
                        state: 'Settled',
                        witnessedBy: this.options.instanceId,
                        invoiceId,
                        outcome,
                        rrn,
                    },
                },
                target,
            ),
        );
    }
}
