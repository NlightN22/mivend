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
        [5000, true],
        [0, false],
        [null, false],
    ])(
        'computed limit %j -> eligible %j (zero/unset means unavailable, never unlimited)',
        async (limit, expected) => {
            getForCustomer.mockResolvedValue({ creditLimit: limit });
            expect(await check({ customer: { id: 1 } } as Partial<Order>)).toBe(expected);
        },
    );

    it('is not eligible without a counterparty or a customer', async () => {
        getForCustomer.mockResolvedValue(null);
        expect(await check({ customer: { id: 1 } } as Partial<Order>)).toBe(false);
        expect(await check({})).toBe(false);
    });
});
