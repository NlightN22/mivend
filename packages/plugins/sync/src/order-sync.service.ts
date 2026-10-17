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
import { withAggregateLock } from 'shared';
import type { SyncEventByType } from 'shared';

import { SyncService } from './sync.service';
import { SYNC_PLUGIN_OPTIONS } from './types';
import type { SyncPluginOptions } from './types';

const loggerCtx = 'OrderSyncService';

// Uses OrderService, not raw entity inserts: OrderLine's taxLines/adjustments/prices are only
// populated by Vendure's pricing/tax pipeline. Customer/ProductVariant match on emailAddress/sku.
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
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        await withAggregateLock(
            this.connection,
            ctx,
            `order-replica:${event.payload.sourceOrderId}`,
            txCtx => this.applyCreateLocked(txCtx, event),
        );
    }

    // One transaction under a per-source lock: a failure rolls the replica back, so a retry never sees a half-built one.
    private async applyCreateLocked(
        ctx: RequestContext,
        event: SyncEventByType<'order.created'>,
    ): Promise<void> {
        const { payload } = event;
        const orders = this.connection.getRepository(ctx, Order);

        const existing: Array<{ id: string }> = await orders.query(
            `SELECT id FROM "order" WHERE "customFieldsSourceorderid" = $1`,
            [payload.sourceOrderId],
        );
        if (existing[0]) return; // already applied — idempotent

        const customerRows: Array<{ userId: string }> = await orders.query(
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
            const variantRows: Array<{ id: string }> = await orders.query(
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

        await orders.update(order.id, {
            customFields: { sourceOrderId: payload.sourceOrderId, branchId: payload.branchId },
        });

        // Replica can't reach payment/shipping-gated states (Payment/ShippingLine not synced), so it stalls
        // one step behind; a failed transition is logged, not fatal.
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
            // Must throw: order.updated can race ahead of order.created, so the replica may not exist yet.
            // Throw routes it to backoff-then-DLQ retry, so a replica that never appears is kept, not lost.
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

    // Two cases only: a replica gets an informational projection (real Vendure order untouched);
    // the owning instance applies it as a real payment via the normal Vendure API.
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
            // Throw for the same race as applyUpdate: the replica may not have landed yet.
            // Retry via backoff-then-DLQ rather than dropping silently.
            throw new Error(
                `Cannot apply payment.recorded [${payload.sourceOrderId}] — no matching local order (replica or origin) found (yet)`,
            );
        }

        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        // addPaymentToOrder asserts an open transaction, unlike create/addItemToOrder/transitionToState.
        // Without it, every payment.recorded fails with 'must be called within a transaction'.
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

    // Never mutates a replica's Vendure order (blocked by ReplicaOrderProcess); only writes to outbox.
    // The owner applies it at once; the PaymentStateTransitionEvent producer reports it onward.
    async recordWitnessedPayment(
        ctx: RequestContext,
        orderId: ID,
        method: string,
        amount: number,
        proformaInvoiceId?: number,
        organizationId?: number,
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
                        proformaInvoiceId,
                        organizationId,
                        outcome,
                        rrn,
                    },
                },
                target,
            ),
        );
    }
}
