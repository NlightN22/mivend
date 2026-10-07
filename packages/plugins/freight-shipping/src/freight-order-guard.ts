import { TradingPointService } from '@mivend/plugin-counterparty';
import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { ShippingMethod, TransactionalConnection } from '@vendure/core';

import { FREIGHT_SHIPPING_METHOD_CODE } from './constants';

export const FREIGHT_NO_TRADING_POINT_MESSAGE = 'Select a trading point to use freight delivery.';

let connection: TransactionalConnection;
let tradingPointService: TradingPointService;

export const freightOrderGuard: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
        tradingPointService = injector.get(TradingPointService);
    },
    async onTransitionStart(fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment') return;
        const lines = order.shippingLines ?? [];
        if (!lines.length) return;
        const methods = await connection
            .getRepository(ctx, ShippingMethod)
            .findByIds(lines.map(l => l.shippingMethodId));
        if (!methods.some(m => m.code === FREIGHT_SHIPPING_METHOD_CODE)) return;
        const customerId = order.customer?.id ?? order.customerId;
        const point = customerId
            ? await tradingPointService.getPreferredForCustomer(ctx, customerId)
            : null;
        if (!point || !point.isActive || point.customerStatus !== 'active') {
            return FREIGHT_NO_TRADING_POINT_MESSAGE;
        }
    },
};
