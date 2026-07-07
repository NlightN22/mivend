import { Injectable, Logger } from '@nestjs/common';
import { EventBus, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderReadyForErpEvent } from './erp-order.events';
import './types';
import type { ErpOrderStatus, ErpStatusUpdatePayload, OrderErpStatusInfo } from './types';

@Injectable()
export class ErpOrderService {
    private readonly logger = new Logger(ErpOrderService.name);

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly eventBus: EventBus,
    ) {}

    async onOrderPlaced(ctx: RequestContext, order: Order): Promise<void> {
        order.customFields.erpStatus = 'PENDING';
        order.customFields.erpStatusAt = new Date();
        await this.connection.getRepository(ctx, Order).save(order);
        this.eventBus.publish(new OrderReadyForErpEvent(ctx, String(order.id), order.code));
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
