import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradingPointService } from '@mivend/plugin-counterparty';
import { TransactionalConnection } from '@vendure/core';
import type { Injector, Order, OrderState, RequestContext } from '@vendure/core';

import { freightOrderGuard, FREIGHT_NO_TRADING_POINT_MESSAGE } from '../../freight-order-guard';

const findByIds = vi.fn();
const getPreferredForCustomer = vi.fn();
const injector = {
    get: (token: unknown) =>
        token === TransactionalConnection
            ? { getRepository: () => ({ findByIds }) }
            : token === TradingPointService
              ? { getPreferredForCustomer }
              : undefined,
} as unknown as Injector;
const order = { customerId: 1, shippingLines: [{ shippingMethodId: 5 }] } as unknown as Order;
const run = (toState: OrderState, o: Order = order) =>
    freightOrderGuard.onTransitionStart?.('AddingItems', toState, {
        ctx: {} as RequestContext,
        order: o,
    });

beforeEach(() => {
    findByIds.mockReset();
    getPreferredForCustomer.mockReset();
    void freightOrderGuard.init?.(injector);
});

describe('freightOrderGuard', () => {
    it('rejects freight without a preferred trading point', async () => {
        findByIds.mockResolvedValue([{ code: 'freight-delivery' }]);
        getPreferredForCustomer.mockResolvedValue(null);
        expect(await run('ArrangingPayment')).toBe(FREIGHT_NO_TRADING_POINT_MESSAGE);
    });

    it('rejects freight when the preferred point is inactive or hidden', async () => {
        findByIds.mockResolvedValue([{ code: 'freight-delivery' }]);
        getPreferredForCustomer.mockResolvedValue({ isActive: false, customerStatus: 'active' });
        expect(await run('ArrangingPayment')).toBe(FREIGHT_NO_TRADING_POINT_MESSAGE);
        getPreferredForCustomer.mockResolvedValue({ isActive: true, customerStatus: 'hidden' });
        expect(await run('ArrangingPayment')).toBe(FREIGHT_NO_TRADING_POINT_MESSAGE);
    });

    it('allows freight with an active preferred point', async () => {
        findByIds.mockResolvedValue([{ code: 'freight-delivery' }]);
        getPreferredForCustomer.mockResolvedValue({ isActive: true, customerStatus: 'active' });
        expect(await run('ArrangingPayment')).toBeUndefined();
    });

    it('does not touch pickup orders or other transitions', async () => {
        findByIds.mockResolvedValue([{ code: 'pickup' }]);
        expect(await run('ArrangingPayment')).toBeUndefined();
        expect(await run('PaymentAuthorized')).toBeUndefined();
        expect(getPreferredForCustomer).not.toHaveBeenCalled();
    });
});
