import { Injectable } from '@nestjs/common';
import { Logger, Order, OrderService, RequestContextService } from '@vendure/core';
import { DataSource } from 'typeorm';
import type { OrderState } from '@vendure/core';
import type { SyncEventByType } from 'shared';

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
            Logger.warn(
                `Cannot apply order.updated [${payload.sourceOrderId}] — no local replica found`,
                loggerCtx,
            );
            return;
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
}
