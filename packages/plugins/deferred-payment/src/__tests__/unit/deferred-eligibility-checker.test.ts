import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import type { Injector, Order, RequestContext } from '@vendure/core';

import { deferredEligibilityChecker } from '../../deferred-eligibility-checker';

const getForCustomer = vi.fn();
const injector = {
    get: (token: unknown) => (token === CounterpartyService ? { getForCustomer } : undefined),
} as unknown as Injector;
const ctx = {} as RequestContext;
const check = (order: Partial<Order>) =>
    deferredEligibilityChecker.check(ctx, order as Order, [], {} as never);

beforeEach(() => {
    getForCustomer.mockReset();
    void deferredEligibilityChecker.init?.(injector);
});

describe('deferredEligibilityChecker', () => {
    it.each([
        [5000, 14, true],
        [5000, 0, false],
        [0, 14, false],
        [0, 0, false],
        [null, 14, false],
        [5000, null, false],
    ])(
        'limit %j and days %j -> eligible %j (zero/unset on either side means prepayment)',
        async (creditLimit, paymentDelayDays, expected) => {
            getForCustomer.mockResolvedValue({ creditLimit, paymentDelayDays });
            expect(await check({ customer: { id: 1 } } as Partial<Order>)).toBe(expected);
        },
    );

    it('is not eligible without a counterparty or a customer', async () => {
        getForCustomer.mockResolvedValue(null);
        expect(await check({ customer: { id: 1 } } as Partial<Order>)).toBe(false);
        expect(await check({})).toBe(false);
    });
});
