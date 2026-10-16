import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import {
    evaluateFreightTradingPoint,
    hasFreightWithoutTradingPoint,
} from '../../freight-trading-point.check';

const findByIds = vi.fn();
const getPreferredForCustomer = vi.fn();
const deps = {
    connection: { getRepository: () => ({ findByIds }) },
    tradingPoints: { getPreferredForCustomer },
} as never;
const ctx = {} as RequestContext;
const gap = (over: { customerId?: number | null; shippingMethodIds?: number[] } = {}) =>
    hasFreightWithoutTradingPoint(deps, ctx, {
        customerId: 1,
        shippingMethodIds: [5],
        ...over,
    });

beforeEach(() => {
    findByIds.mockReset().mockResolvedValue([{ code: 'freight-delivery' }]);
    getPreferredForCustomer.mockReset();
});

describe('hasFreightWithoutTradingPoint', () => {
    it('is a gap for freight without a preferred trading point', async () => {
        getPreferredForCustomer.mockResolvedValue(null);
        expect(await gap()).toBe(true);
        expect(await gap({ customerId: null })).toBe(true);
    });

    it('is a gap when the preferred point is inactive or hidden', async () => {
        getPreferredForCustomer.mockResolvedValue({ isActive: false, customerStatus: 'active' });
        expect(await gap()).toBe(true);
        getPreferredForCustomer.mockResolvedValue({ isActive: true, customerStatus: 'hidden' });
        expect(await gap()).toBe(true);
    });

    it('is no gap with an active preferred point', async () => {
        getPreferredForCustomer.mockResolvedValue({ isActive: true, customerStatus: 'active' });
        expect(await gap()).toBe(false);
    });

    it('never flags pickup or an order with no shipping line', async () => {
        findByIds.mockResolvedValue([{ code: 'pickup' }]);
        expect(await gap()).toBe(false);
        expect(await gap({ shippingMethodIds: [] })).toBe(false);
        expect(getPreferredForCustomer).not.toHaveBeenCalled();
    });
});

describe('evaluateFreightTradingPoint', () => {
    it('yields one order-level finding for a gap and none otherwise', () => {
        expect(evaluateFreightTradingPoint(true)).toEqual([
            {
                severity: 'error',
                messageKey: 'delivery.freight-trading-point.missing',
                facts: { reason: 'no-active-trading-point' },
            },
        ]);
        expect(evaluateFreightTradingPoint(false)).toEqual([]);
    });
});
