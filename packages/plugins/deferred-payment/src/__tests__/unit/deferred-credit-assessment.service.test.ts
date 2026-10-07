import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreditLimitCheckService } from '@mivend/plugin-counterparty';
import type { Order, RequestContext } from '@vendure/core';

import { DeferredCreditAssessmentService } from '../../deferred-credit-assessment.service';

const getForCustomer = vi.fn();
const sumUnconfirmedRubles = vi.fn();
const service = new DeferredCreditAssessmentService(
    { getForCustomer } as never,
    new CreditLimitCheckService(null as never, null as never),
    { sumUnconfirmedRubles } as never,
);
const ctx = {} as RequestContext;
const order = (kopecks: number, customerId: number | undefined = 7): Order =>
    ({
        id: 9,
        totalWithTax: kopecks,
        customer: customerId ? { id: customerId } : undefined,
    }) as never;

beforeEach(() => {
    getForCustomer.mockReset();
    sumUnconfirmedRubles.mockReset();
    sumUnconfirmedRubles.mockResolvedValue(0);
});

describe('DeferredCreditAssessmentService.assess', () => {
    it('is not exceeded when the order fits the available credit', async () => {
        getForCustomer.mockResolvedValue({ id: 3, creditLimit: 1000, creditBalance: 200 });
        expect(await service.assess(ctx, order(50000))).toEqual({
            exceeded: false,
            availableCredit: 800,
            orderAmount: 500,
        });
    });

    it('is not exceeded when the order equals the available credit exactly', async () => {
        getForCustomer.mockResolvedValue({ id: 3, creditLimit: 1000, creditBalance: 200 });
        expect((await service.assess(ctx, order(80000)))?.exceeded).toBe(false);
    });

    it('is exceeded one kopeck above the available credit', async () => {
        getForCustomer.mockResolvedValue({ id: 3, creditLimit: 1000, creditBalance: 200 });
        expect((await service.assess(ctx, order(80001)))?.exceeded).toBe(true);
    });

    it('subtracts open unconfirmed deferred orders from the available credit', async () => {
        getForCustomer.mockResolvedValue({ id: 3, creditLimit: 1000, creditBalance: 200 });
        sumUnconfirmedRubles.mockResolvedValue(300);
        const result = await service.assess(ctx, order(50001));
        expect(result).toEqual({ exceeded: true, availableCredit: 500, orderAmount: 500 });
        expect(sumUnconfirmedRubles).toHaveBeenCalledWith(ctx, 3, 9);
    });

    it('returns null without a counterparty or customer', async () => {
        getForCustomer.mockResolvedValue(null);
        expect(await service.assess(ctx, order(100))).toBeNull();
        expect(await service.assess(ctx, order(100, undefined))).toBeNull();
    });

    it('evaluates each counterparty against its own limit and exposure', async () => {
        getForCustomer.mockImplementation(async (_c: unknown, id: number) =>
            id === 1
                ? { id: 1, creditLimit: 100, creditBalance: 0 }
                : { id: 2, creditLimit: 10000, creditBalance: 0 },
        );
        sumUnconfirmedRubles.mockImplementation(async (_c: unknown, cp: number) =>
            cp === 1 ? 0 : 50,
        );
        expect((await service.assess(ctx, order(50000, 1)))?.exceeded).toBe(true);
        expect((await service.assess(ctx, order(50000, 2)))?.exceeded).toBe(false);
    });
});
