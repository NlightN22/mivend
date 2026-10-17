import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { HistoryEntryType } from '@vendure/common/lib/generated-types';
import { In, IsNull } from 'typeorm';
import {
    EventBus,
    HistoryService,
    Order,
    RequestContext,
    ShippingLine,
    ShippingMethod,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import {
    CounterpartyService,
    TradingPoint,
    TradingPointService,
} from '@mivend/plugin-counterparty';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import {
    FREIGHT_SHIPPING_METHOD_CODE,
    PICKUP_SHIPPING_METHOD_CODE,
    withAggregateLock,
} from 'shared';

import { OrderChecksService } from './order-checks.service';
import { OrderDeliveryEditedEvent } from './order-line-edit.events';
import { OrderLineEditGuard } from './order-line-edit.guard';

export type OrderDeliveryMethod = 'PICKUP' | 'COURIER';

// Staff change of how a placed order is delivered, until it is sent to the ERP (same editability as line edits, #233).
@Injectable()
export class OrderDeliveryEditService {
    constructor(
        private connection: TransactionalConnection,
        private visibility: OrderVisibilityService,
        private guard: OrderLineEditGuard,
        private history: HistoryService,
        private tradingPoints: TradingPointService,
        private counterparties: CounterpartyService,
        private eventBus: EventBus,
        private orderChecks: OrderChecksService,
    ) {}

    async setDelivery(
        ctx: RequestContext,
        orderId: ID,
        method: OrderDeliveryMethod,
        tradingPointId: ID | null,
    ): Promise<void> {
        if (method === 'COURIER' && !tradingPointId) {
            throw new UserInputError('Courier delivery needs a trading point');
        }
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const visible = await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId }).getOne();
        if (!visible) throw new UserInputError('Order not found');

        await withAggregateLock(this.connection, ctx, `reserve-order:${orderId}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, Order);
            const order = await repo
                .createQueryBuilder('o')
                .setLock('pessimistic_write')
                .where('o.id = :id', { id: orderId })
                .getOne();
            if (!order) throw new UserInputError('Order not found');
            await this.guard.assertEditable(txCtx, order);
            const point =
                method === 'COURIER' ? await this.ownPoint(txCtx, order, tradingPointId) : null;
            await this.switchShippingMethod(txCtx, order, method);
            await repo.update(order.id, {
                customFields: {
                    tradingPointId: point ? String(point.id) : null,
                    deliveryAddress: point ? point.address || null : null,
                },
            });
            await this.history.createHistoryEntryForOrder(
                {
                    ctx: txCtx,
                    orderId,
                    type: HistoryEntryType.ORDER_NOTE,
                    data: {
                        note: point
                            ? `Delivery changed by staff: courier to ${point.name}`
                            : 'Delivery changed by staff: self-pickup',
                    },
                },
                false,
            );
            await this.orderChecks.run(txCtx, String(orderId), 'on-edit');
            await this.eventBus.publish(new OrderDeliveryEditedEvent(txCtx, orderId));
        });
    }

    private async ownPoint(
        ctx: RequestContext,
        order: Order,
        tradingPointId: ID | null,
    ): Promise<TradingPoint> {
        const counterparty = order.customerId
            ? await this.counterparties.getForCustomer(ctx, order.customerId)
            : null;
        const points = counterparty
            ? await this.tradingPoints.findVisibleForCounterparty(ctx, counterparty.id)
            : [];
        const point = points.find(p => String(p.id) === String(tradingPointId));
        if (!point) throw new UserInputError("The trading point is not one of the order's client");
        return point;
    }

    private async switchShippingMethod(
        ctx: RequestContext,
        order: Order,
        method: OrderDeliveryMethod,
    ): Promise<void> {
        const code =
            method === 'COURIER' ? FREIGHT_SHIPPING_METHOD_CODE : PICKUP_SHIPPING_METHOD_CODE;
        const target = await this.connection
            .getRepository(ctx, ShippingMethod)
            .findOne({ where: { code, deletedAt: IsNull() } });
        if (!target) throw new UserInputError(`Shipping method ${code} is not configured`);
        const rate = target.calculator?.args?.find(a => a.name === 'rate')?.value;
        if (rate !== undefined && Number(rate) !== 0) {
            throw new UserInputError(`Shipping method ${code} must be free but has a rate`);
        }
        const lines = await this.connection
            .getRepository(ctx, ShippingLine)
            .find({ where: { order: { id: order.id } } });
        if (lines.length === 0) throw new UserInputError('The order has no shipping line');
        await this.connection
            .getRepository(ctx, ShippingLine)
            .update({ id: In(lines.map(l => l.id)) }, { shippingMethodId: target.id });
    }
}
