import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { AdministratorService, Order, ShippingLine, TransactionalConnection } from '@vendure/core';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { FREIGHT_SHIPPING_METHOD_CODE } from 'shared';

import './types';

export const FREIGHT_WITHOUT_POINT_MESSAGE =
    'Courier delivery needs a trading point of the client; choose one or switch to self-pickup.';

let connection: TransactionalConnection;
let tradingPoints: TradingPointService;
let counterparties: CounterpartyService;
let administrators: AdministratorService;

// Placement refuses a courier order without a usable point; staff pick the point on the order, a customer's is the preferred one.
export const freightPointGuard: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
        tradingPoints = injector.get(TradingPointService);
        counterparties = injector.get(CounterpartyService);
        administrators = injector.get(AdministratorService);
    },
    async onTransitionStart(fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment') return;
        if (fromState !== 'AddingItems' && fromState !== 'Draft') return;
        const lines = await connection.getRepository(ctx, ShippingLine).find({
            where: { order: { id: order.id } },
            relations: ['shippingMethod'],
        });
        if (!lines.some(l => l.shippingMethod?.code === FREIGHT_SHIPPING_METHOD_CODE)) return;
        if (!order.customerId) return FREIGHT_WITHOUT_POINT_MESSAGE;

        const isStaff =
            ctx.activeUserId !== undefined &&
            !!(await administrators.findOneByUserId(ctx, ctx.activeUserId));
        const point = isStaff
            ? await chosenPoint(ctx, order)
            : await tradingPoints.getPreferredForCustomer(ctx, order.customerId);
        if (!point || !point.isActive || point.customerStatus !== 'active') {
            return FREIGHT_WITHOUT_POINT_MESSAGE;
        }
        if (!isStaff) return;
        const counterparty = await counterparties.getForCustomer(ctx, order.customerId);
        if (!counterparty || String(counterparty.id) !== String(point.counterpartyId)) {
            return FREIGHT_WITHOUT_POINT_MESSAGE;
        }
    },
};

async function chosenPoint(
    ctx: Parameters<typeof tradingPoints.findById>[0],
    order: Order,
): ReturnType<typeof tradingPoints.findById> {
    const fresh = await connection
        .getRepository(ctx, Order)
        .findOne({ where: { id: order.id }, loadEagerRelations: false });
    const pointId = fresh?.customFields?.tradingPointId;
    return pointId ? tradingPoints.findById(ctx, pointId) : null;
}
