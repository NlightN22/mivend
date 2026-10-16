import type { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { ShippingMethod } from '@vendure/core';
import type { Finding } from '@mivend/plugin-checks';
import type { TradingPointService } from '@mivend/plugin-counterparty';

import { FREIGHT_SHIPPING_METHOD_CODE } from './constants';

export const FREIGHT_TRADING_POINT = 'delivery.freight-trading-point';

interface FreightDeps {
    connection: Pick<TransactionalConnection, 'getRepository'>;
    tradingPoints: Pick<TradingPointService, 'getPreferredForCustomer'>;
}

// True when the order ships by freight but the customer has no active, visible trading point to ship to.
export async function hasFreightWithoutTradingPoint(
    deps: FreightDeps,
    ctx: RequestContext,
    order: { customerId: ID | null; shippingMethodIds: ID[] },
): Promise<boolean> {
    if (order.shippingMethodIds.length === 0) return false;
    const methods = await deps.connection
        .getRepository(ctx, ShippingMethod)
        .findByIds(order.shippingMethodIds);
    if (!methods.some(m => m.code === FREIGHT_SHIPPING_METHOD_CODE)) return false;
    const point = order.customerId
        ? await deps.tradingPoints.getPreferredForCustomer(ctx, order.customerId)
        : null;
    return !point || !point.isActive || point.customerStatus !== 'active';
}

export function evaluateFreightTradingPoint(gap: boolean): Finding[] {
    return gap
        ? [
              {
                  severity: 'error',
                  messageKey: 'delivery.freight-trading-point.missing',
                  facts: { reason: 'no-active-trading-point' },
              },
          ]
        : [];
}
