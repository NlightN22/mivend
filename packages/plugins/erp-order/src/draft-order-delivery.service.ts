import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { Order, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { withAggregateLock } from 'shared';

import { OrderVisibilityService } from './order-visibility.service';
import './types';

// Staff choice of the client's trading point for a draft order; no point means self-pickup.
@Injectable()
export class DraftOrderDeliveryService {
    constructor(
        private connection: TransactionalConnection,
        private visibility: OrderVisibilityService,
        private tradingPoints: TradingPointService,
        private counterparties: CounterpartyService,
    ) {}

    async setTradingPoint(
        ctx: RequestContext,
        orderId: ID,
        tradingPointId: ID | null,
    ): Promise<void> {
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
            if (order.state !== 'Draft') {
                throw new UserInputError('The delivery point can be set only on a draft order');
            }
            if (!tradingPointId) {
                await repo.update(order.id, {
                    customFields: { tradingPointId: null, deliveryAddress: null },
                });
                return;
            }
            const counterpartyId = await this.counterpartyIdOf(txCtx, order);
            const point = (
                await this.tradingPoints.findVisibleForCounterparty(txCtx, counterpartyId)
            ).find(p => String(p.id) === String(tradingPointId));
            if (!point) {
                throw new UserInputError("The trading point is not one of the order's client");
            }
            await repo.update(order.id, {
                customFields: {
                    tradingPointId: String(point.id),
                    deliveryAddress: point.address || null,
                },
            });
        });
    }

    private async counterpartyIdOf(ctx: RequestContext, order: Order): Promise<string> {
        const fromOrder = order.customFields?.counterpartyId;
        if (fromOrder) return String(fromOrder);
        if (!order.customerId) throw new UserInputError('Set the customer of the order first');
        const counterparty = await this.counterparties.getForCustomer(ctx, order.customerId);
        if (!counterparty) throw new UserInputError('The order customer has no counterparty');
        return String(counterparty.id);
    }
}
