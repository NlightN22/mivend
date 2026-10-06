import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CounterpartyService, CreditLimitCheckService } from '@mivend/plugin-counterparty';
import type { Injector, Order, RequestContext } from '@vendure/core';

import { deferredPaymentHandler } from '../../deferred-payment-handler';
import { deferredEligibilityChecker } from '../../deferred-eligibility-checker';
import { OpenDeferredExposureService } from '../../open-deferred-exposure.service';

const getForCustomer = vi.fn();
const sumUnconfirmedRubles = vi.fn();
const decide = vi.fn();
const providers = new Map<unknown, unknown>([
    [CounterpartyService, { getForCustomer }],
    [CreditLimitCheckService, { decide }],
    [OpenDeferredExposureService, { sumUnconfirmedRubles }],
]);
const injector = { get: (token: unknown) => providers.get(token) } as unknown as Injector;
const ctx = {} as RequestContext;
const order = (total: number): Order =>
    ({ id: 9, totalWithTax: total, customer: { id: 7 } }) as unknown as Order;

const pay = (total: number) =>
    deferredPaymentHandler.createPayment(ctx, order(total), total, [], {}, undefined as never);

beforeEach(() => {
    getForCustomer.mockReset();
    sumUnconfirmedRubles.mockReset();
    decide.mockReset();
    void deferredPaymentHandler.init?.(injector);
    void deferredEligibilityChecker.init?.(injector);
});

describe('deferredPaymentHandler.createPayment', () => {
    it('counts the order plus open unconfirmed deferred orders against the limit (rubles)', async () => {
        getForCustomer.mockResolvedValue({ id: 3, creditLimit: 1000, creditBalance: 100 });
        sumUnconfirmedRubles.mockResolvedValue(250);
        decide.mockReturnValue({ withinLimit: true });
        await pay(50000);
        expect(sumUnconfirmedRubles).toHaveBeenCalledWith(ctx, 3, 9);
        expect(decide).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), null, 750);
    });

    it('authorizes and does not flag an order within the limit', async () => {
        getForCustomer.mockResolvedValue({ id: 3 });
        sumUnconfirmedRubles.mockResolvedValue(0);
        decide.mockReturnValue({ withinLimit: true });
        const result = await pay(50000);
        expect(result.state).toBe('Authorized');
        expect(result.metadata).toEqual({ public: { creditLimitExceeded: false } });
    });

    it('still authorizes an order over the limit but flags it publicly', async () => {
        getForCustomer.mockResolvedValue({ id: 3 });
        sumUnconfirmedRubles.mockResolvedValue(0);
        decide.mockReturnValue({ withinLimit: false });
        const result = await pay(50000);
        expect(result.state).toBe('Authorized');
        expect(result.metadata).toEqual({ public: { creditLimitExceeded: true } });
    });

    it('declines a customer without a counterparty', async () => {
        getForCustomer.mockResolvedValue(null);
        expect((await pay(100)).state).toBe('Declined');
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
