import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Injector, Order, RequestContext } from '@vendure/core';

import { deferredPaymentHandler } from '../../deferred-payment-handler';
import { deferredEligibilityChecker } from '../../deferred-eligibility-checker';

const getForCustomer = vi.fn();
const injector = { get: () => ({ getForCustomer }) } as unknown as Injector;
const ctx = {} as RequestContext;
const order = (total: number): Order =>
    ({ totalWithTax: total, customer: { id: 7 } }) as unknown as Order;

beforeEach(() => {
    getForCustomer.mockReset();
    void deferredPaymentHandler.init?.(injector);
    void deferredEligibilityChecker.init?.(injector);
});

describe('deferredPaymentHandler.createPayment', () => {
    it('authorizes within the limit', async () => {
        getForCustomer.mockResolvedValue({ creditLimit: 1000, creditBalance: 0 });
        const result = await deferredPaymentHandler.createPayment(
            ctx,
            order(50000),
            50000,
            [],
            {},
            undefined as never,
        );
        expect(result.state).toBe('Authorized');
    });

    it('declines with a structured reason over the limit', async () => {
        getForCustomer.mockResolvedValue({ creditLimit: 1000, creditBalance: 900 });
        const result = await deferredPaymentHandler.createPayment(
            ctx,
            order(50000),
            50000,
            [],
            {},
            undefined as never,
        );
        expect(result.state).toBe('Declined');
        expect(result.errorMessage).toContain('credit-limit-exceeded');
    });

    it('declines a customer without a counterparty', async () => {
        getForCustomer.mockResolvedValue(null);
        const result = await deferredPaymentHandler.createPayment(
            ctx,
            order(100),
            100,
            [],
            {},
            undefined as never,
        );
        expect(result.state).toBe('Declined');
    });
});

describe('deferredEligibilityChecker.check', () => {
    it.each([
        [{ creditLimit: 5000 }, true],
        [{ creditLimit: 0 }, false],
        [null, false],
    ])('counterparty %j → %s', async (counterparty, expected) => {
        getForCustomer.mockResolvedValue(counterparty);
        expect(await deferredEligibilityChecker.check(ctx, order(100), [], {} as never)).toBe(
            expected,
        );
    });
});
