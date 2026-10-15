import { Injectable, Logger } from '@nestjs/common';
import {
    AdministratorService,
    EventBus,
    Fulfillment,
    Order,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { OrderReadyForErpEvent } from './erp-order.events';
import { OrderStatusHistoryService } from './order-status-history.service';
import { OrderStatusReferenceService } from './order-status-reference.service';
import './types';
import type { ErpStatusUpdatePayload, OrderErpStatusInfo } from './types';

@Injectable()
export class ErpOrderService {
    private readonly logger = new Logger(ErpOrderService.name);

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly eventBus: EventBus,
        private readonly tradingPointService: TradingPointService,
        private readonly administratorService: AdministratorService,
        private readonly counterpartyService: CounterpartyService,
        private readonly statusHistory: OrderStatusHistoryService,
        private readonly statusReference: OrderStatusReferenceService,
    ) {}

    async onOrderPlaced(ctx: RequestContext, order: Order): Promise<void> {
        const initialStatus = (await this.statusReference.dictionary(ctx)).codeWith('initial');
        order.customFields.erpStatus = initialStatus;
        order.customFields.erpStatusAt = new Date();

        // Denormalized at placement time; see docs/access-control.md (branch-scope axis).
        // A missing preferred trading point is not an error; the order just gets no branch scope.
        if (order.customerId) {
            if (!order.customFields.counterpartyId) {
                const counterparty = await this.counterpartyService.getForCustomer(
                    ctx,
                    order.customerId,
                );
                if (counterparty) order.customFields.counterpartyId = String(counterparty.id);
            }
            const tradingPoint = await this.tradingPointService.getPreferredForCustomer(
                ctx,
                order.customerId,
            );
            if (tradingPoint) {
                order.customFields.tradingPointId = String(tradingPoint.id);
                order.customFields.branchId =
                    await this.tradingPointService.resolveServicingBranchId(ctx, tradingPoint);
            }
        }

        // Stored once at creation, not derived per request from the first HistoryEntry (pagination).
        // Stays null for storefront checkout: ctx.activeUserId doesn't resolve to an Administrator there.
        if (ctx.activeUserId !== undefined) {
            const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
            if (admin) {
                order.customFields.placedByAdministratorId = String(admin.id);
            }
        }

        await this.connection.getRepository(ctx, Order).save(order);
        await this.statusHistory.record(ctx, order.id, initialStatus);
        this.eventBus.publish(new OrderReadyForErpEvent(ctx, String(order.id), order.code));
    }

    // Kept server-side so orders can be sorted and filtered without computing it per request.
    // A Fulfillment can cover multiple orders, so every one of them is updated.
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

            // Plain SQL UPDATE of only the changed key, not save() of a full snapshot — see
            // updateStatus()'s identical comment (#209).
            await this.connection.getRepository(ctx, Order).update(order.id, {
                customFields: { latestFulfillmentState: latestState },
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
        if (!(await this.statusReference.dictionary(ctx)).get(payload.status)) {
            this.logger.warn(`updateStatus: unknown status ${payload.status}, ${order.code} kept`);
            return;
        }

        // Plain SQL UPDATE of only the changed keys, not save() of a full snapshot — save()
        // would also recompute calculated fields that require lines/surcharges joined (#209).
        await repo.update(order.id, {
            customFields: {
                erpStatus: payload.status,
                erpStatusAt: new Date(),
                ...(payload.erpOrderId ? { erpOrderId: payload.erpOrderId } : {}),
            },
        });
        await this.statusHistory.record(ctx, order.id, payload.status);
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
            status: (order.customFields.erpStatus ?? null) as string | null,
            erpOrderId: order.customFields.erpOrderId ?? null,
            updatedAt: order.customFields.erpStatusAt ?? null,
        };
    }
}
