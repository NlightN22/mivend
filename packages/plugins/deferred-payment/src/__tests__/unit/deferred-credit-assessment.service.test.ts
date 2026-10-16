import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreditLimitCheckService } from '@mivend/plugin-counterparty';
import type { Order, RequestContext } from '@vendure/core';

import { DeferredCreditAssessmentService } from '../../deferred-credit-assessment.service';

const getForCustomer = vi.fn();
const sumUnconfirmedRubles = vi.fn();
const resolveEffective = vi.fn();
const getPreferredForCustomer = vi.fn();
const resolveServicingBranchId = vi.fn();
const resolvePolicy = vi.fn();
const service = new DeferredCreditAssessmentService(
    { getForCustomer } as never,
    new CreditLimitCheckService(null as never, null as never),
    { sumUnconfirmedRubles } as never,
    { resolveEffective } as never,
    { getPreferredForCustomer, resolveServicingBranchId } as never,
    { resolve: resolvePolicy } as never,
);
const ctx = {} as RequestContext;
const order = (
    kopecks: number,
    customerId: number | undefined = 7,
    branchId: string | null = null,
): Order =>
    ({
        id: 9,
        customFields: { branchId },
        totalWithTax: kopecks,
        customer: customerId ? { id: customerId } : undefined,
    }) as never;

beforeEach(() => {
    getForCustomer.mockReset();
    sumUnconfirmedRubles.mockReset();
    sumUnconfirmedRubles.mockResolvedValue(0);
    resolveEffective.mockReset();
    resolveEffective.mockResolvedValue(null);
    getPreferredForCustomer.mockReset();
    getPreferredForCustomer.mockResolvedValue(null);
    resolvePolicy.mockReset();
    resolvePolicy.mockResolvedValue({ enabled: true, consequence: 'hold' });
});

describe('DeferredCreditAssessmentService.assess', () => {
    it('is not exceeded when the order fits the available credit', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 1000,
            creditBalance: 200,
            paymentDelayDays: 14,
        });
        expect(await service.assess(ctx, order(50000))).toEqual({
            exceeded: false,
            availableCredit: 800,
            orderAmount: 500,
            allowExceedingCreditLimit: false,
            prepaymentReserveDays: 3,
            limitControlled: true,
            excessKopecks: 0,
        });
    });

    it('is not exceeded when the order equals the available credit exactly', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 1000,
            creditBalance: 200,
            paymentDelayDays: 14,
        });
        expect((await service.assess(ctx, order(80000)))?.exceeded).toBe(false);
    });

    it('is exceeded one kopeck above the available credit', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 1000,
            creditBalance: 200,
            paymentDelayDays: 14,
        });
        expect((await service.assess(ctx, order(80001)))?.exceeded).toBe(true);
    });

    it('subtracts open unconfirmed deferred orders from the available credit', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 1000,
            creditBalance: 200,
            paymentDelayDays: 14,
        });
        sumUnconfirmedRubles.mockResolvedValue(300);
        const result = await service.assess(ctx, order(50001));
        expect(result).toEqual({
            exceeded: true,
            availableCredit: 500,
            orderAmount: 500,
            allowExceedingCreditLimit: false,
            prepaymentReserveDays: 3,
            limitControlled: true,
            excessKopecks: 0,
        });
        expect(sumUnconfirmedRubles).toHaveBeenCalledWith(ctx, 3, 9);
    });

    it('reads the credit.limit checkout policy of the order branch: warn allows exceeding', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 1000,
            creditBalance: 0,
            paymentDelayDays: 14,
        });
        resolvePolicy.mockResolvedValue({ enabled: true, consequence: 'warn' });
        const result = await service.assess(ctx, order(100, 7, 'branch-a'));
        expect(result?.allowExceedingCreditLimit).toBe(true);
        expect(resolvePolicy).toHaveBeenCalledWith(ctx, 'credit.limit', 'checkout', 'branch-a');
        expect(getPreferredForCustomer).not.toHaveBeenCalled();
    });

    it('a disabled policy means no limit control, info allows exceeding like warn', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 1000,
            creditBalance: 1000,
            paymentDelayDays: 14,
        });
        resolvePolicy.mockResolvedValue({ enabled: false, consequence: 'hold' });
        expect((await service.assess(ctx, order(100, 7, 'branch-a')))?.exceeded).toBe(false);
        resolvePolicy.mockResolvedValue({ enabled: true, consequence: 'info' });
        const result = await service.assess(ctx, order(100, 7, 'branch-a'));
        expect(result).toMatchObject({ exceeded: true, allowExceedingCreditLimit: true });
    });

    it('falls back to the preferred trading point branch before placement', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 1000,
            creditBalance: 0,
            paymentDelayDays: 14,
        });
        getPreferredForCustomer.mockResolvedValue({ id: 5 });
        resolveServicingBranchId.mockResolvedValue('branch-b');
        resolvePolicy.mockResolvedValue({ enabled: true, consequence: 'hold' });
        const result = await service.assess(ctx, order(100));
        expect(result?.allowExceedingCreditLimit).toBe(false);
        expect(resolvePolicy).toHaveBeenCalledWith(ctx, 'credit.limit', 'checkout', 'branch-b');
    });

    it('returns null without a counterparty or customer', async () => {
        getForCustomer.mockResolvedValue(null);
        expect(await service.assess(ctx, order(100))).toBeNull();
        expect(await service.assess(ctx, order(100, undefined))).toBeNull();
    });

    it('evaluates each counterparty against its own limit and exposure', async () => {
        getForCustomer.mockImplementation(async (_c: unknown, id: number) =>
            id === 1
                ? { id: 1, creditLimit: 100, creditBalance: 0, paymentDelayDays: 14 }
                : { id: 2, creditLimit: 10000, creditBalance: 0, paymentDelayDays: 14 },
        );
        sumUnconfirmedRubles.mockImplementation(async (_c: unknown, cp: number) =>
            cp === 1 ? 0 : 50,
        );
        expect((await service.assess(ctx, order(50000, 1)))?.exceeded).toBe(true);
        expect((await service.assess(ctx, order(50000, 2)))?.exceeded).toBe(false);
    });

    it('reads the prepayment reserve days from the branch settings', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 0,
            creditBalance: 0,
            paymentDelayDays: 0,
        });
        resolveEffective.mockResolvedValue({ prepaymentReserveDays: 5 });
        expect((await service.assess(ctx, order(100)))?.prepaymentReserveDays).toBe(5);
    });

    it.each([
        [0, 14],
        [1000, 0],
    ])(
        'is prepayment (limit %s, delay %s days): never exceeded, no excess',
        async (limit, delay) => {
            getForCustomer.mockResolvedValue({
                id: 3,
                creditLimit: limit,
                creditBalance: 5000,
                paymentDelayDays: delay,
            });
            expect(await service.assess(ctx, order(10_000_000))).toMatchObject({
                limitControlled: false,
                exceeded: false,
                excessKopecks: 0,
            });
        },
    );

    it('reports the excess over the limit that exists before this order, in kopecks', async () => {
        getForCustomer.mockResolvedValue({
            id: 3,
            creditLimit: 1000,
            creditBalance: 900,
            paymentDelayDays: 14,
        });
        sumUnconfirmedRubles.mockResolvedValue(250.5);
        expect(await service.assess(ctx, order(100))).toMatchObject({
            exceeded: true,
            excessKopecks: 15_050,
        });
    });
});
