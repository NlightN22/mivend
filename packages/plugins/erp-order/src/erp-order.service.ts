import { Injectable, Logger } from '@nestjs/common';
import {
    AdministratorService,
    EventBus,
    Fulfillment,
    Order,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { TradingPointService } from '@mivend/plugin-counterparty';
import { OrderReadyForErpEvent } from './erp-order.events';
import './types';
import type { ErpOrderStatus, ErpStatusUpdatePayload, OrderErpStatusInfo } from './types';

@Injectable()
export class ErpOrderService {
    private readonly logger = new Logger(ErpOrderService.name);

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly eventBus: EventBus,
        private readonly tradingPointService: TradingPointService,
        private readonly administratorService: AdministratorService,
    ) {}

    async onOrderPlaced(ctx: RequestContext, order: Order): Promise<void> {
        order.customFields.erpStatus = 'PENDING';
        order.customFields.erpStatusAt = new Date();

        // Denormalize the servicing branch onto the order at placement time — see
        // docs/access-control.md's branch-scope axis. A missing preferred trading point (no
        // trading points yet, or a placement path that never went through checkout's selector)
        // is not an error: the order simply has no branch scope, same as any other optional
        // custom field.
        if (order.customerId) {
            const tradingPoint = await this.tradingPointService.getPreferredForCustomer(
                ctx,
                order.customerId,
            );
            if (tradingPoint) {
                order.customFields.tradingPointId = String(tradingPoint.id);
                order.customFields.branchId = tradingPoint.servicingBranchId;
            }
        }

        // Denormalized once, here, rather than derived per-request from the order's first
        // HistoryEntry (see AGENTS.md pagination/frontend-computation session note) — null
        // stays null for a storefront customer's own checkout (ctx.activeUserId won't resolve
        // to an Administrator in that case), matching the old client-side "(customer)" fallback.
        if (ctx.activeUserId !== undefined) {
            const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
            if (admin) {
                order.customFields.placedByAdministratorId = String(admin.id);
            }
        }

        await this.connection.getRepository(ctx, Order).save(order);
        this.eventBus.publish(new OrderReadyForErpEvent(ctx, String(order.id), order.code));
    }

    // Keeps Order.customFields.latestFulfillmentState in sync whenever a Fulfillment is added or
    // transitions — see vendure-config.ts's doc comment on that field for why this exists
    // (sortable/filterable server-side instead of computed per-request from the fulfillments
    // relation). A Fulfillment can in principle cover multiple orders, so this updates each one.
    async onFulfillmentStateChanged(ctx: RequestContext, fulfillment: Fulfillment): Promise<void> {
        const full = await this.connection
            .getRepository(ctx, Fulfillment)
            .findOne({ where: { id: fulfillment.id }, relations: ['orders'] });
        if (!full) return;

        for (const orderRef of full.orders) {
            const orderFulfillments = await this.connection
                .getRepository(ctx, Fulfillment)
                .createQueryBuilder('fulfillment')
                .innerJoin('fulfillment.orders', 'o')
                .where('o.id = :orderId', { orderId: orderRef.id })
                .orderBy('fulfillment.createdAt', 'ASC')
                .getMany();
            const latestState = orderFulfillments[orderFulfillments.length - 1]?.state ?? null;

            const order = await this.connection.getRepository(ctx, Order).findOne({
                where: { id: orderRef.id },
            });
            if (!order) continue;

            // Plain SQL UPDATE, not save() — see updateStatus()'s identical doc comment on why
            // (save() would recompute calculated fields that require lines/surcharges joined).
            await this.connection.getRepository(ctx, Order).update(order.id, {
                customFields: { ...order.customFields, latestFulfillmentState: latestState },
            });
        }
    }

    async updateStatus(ctx: RequestContext, payload: ErpStatusUpdatePayload): Promise<void> {
        const repo = this.connection.getRepository(ctx, Order);
        const order = await repo.findOne({ where: { code: payload.orderCode } });

        if (!order) {
            this.logger.warn(`updateStatus: order not found for code=${payload.orderCode}`);
            return;
        }

        // `repo.update()` issues a plain SQL UPDATE without loading/recomputing
        // the full entity — `save()` would recompute calculated fields (discounts,
        // taxSummary) which require lines/surcharges to be joined, crashing the process.
        await repo.update(order.id, {
            customFields: {
                ...order.customFields,
                erpStatus: payload.status,
                erpStatusAt: new Date(),
                ...(payload.erpOrderId ? { erpOrderId: payload.erpOrderId } : {}),
            },
        });
        this.logger.log(`Order ${order.code} status → ${payload.status}`);
    }

    // Lets the ERP re-query current status on demand (e.g. after a missed
    // callback, or for reconciliation) — complements updateStatus's push path.
    async getStatus(ctx: RequestContext, orderCode: string): Promise<OrderErpStatusInfo | null> {
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { code: orderCode } });
        if (!order) return null;

        return {
            orderCode: order.code,
            status: (order.customFields.erpStatus ?? null) as ErpOrderStatus | null,
            erpOrderId: order.customFields.erpOrderId ?? null,
            updatedAt: order.customFields.erpStatusAt ?? null,
        };
    }
}
