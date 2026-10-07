import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import type { Injector, Order, RequestContext } from '@vendure/core';

import { freightEligibilityChecker } from '../../freight-eligibility-checker';

const getForCustomer = vi.fn();
const findVisibleForCounterparty = vi.fn();
const injector = {
    get: (token: unknown) =>
        token === CounterpartyService
            ? { getForCustomer }
            : token === TradingPointService
              ? { findVisibleForCounterparty }
              : undefined,
} as unknown as Injector;
const check = (order: Partial<Order>) =>
    freightEligibilityChecker.check({} as RequestContext, order as Order, [], {} as never);

beforeEach(() => {
    getForCustomer.mockReset();
    findVisibleForCounterparty.mockReset();
    void freightEligibilityChecker.init?.(injector);
});

describe('freightEligibilityChecker', () => {
    it.each([
        [[], false],
        [[{ id: '1' }], true],
    ])('visible active trading points %j -> eligible %j', async (points, expected) => {
        getForCustomer.mockResolvedValue({ id: '7' });
        findVisibleForCounterparty.mockResolvedValue(points);
        expect(await check({ customer: { id: 1 } } as Partial<Order>)).toBe(expected);
        expect(findVisibleForCounterparty).toHaveBeenCalledWith({}, '7');
    });

    it('is not eligible without a customer or a counterparty', async () => {
        expect(await check({})).toBe(false);
        getForCustomer.mockResolvedValue(null);
        expect(await check({ customer: { id: 1 } } as Partial<Order>)).toBe(false);
        expect(findVisibleForCounterparty).not.toHaveBeenCalled();
    });
});
