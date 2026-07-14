import { describe, it, expect, vi } from 'vitest';
import { ForbiddenError, RequestContext } from '@vendure/core';

import { CounterpartyCreditResolver, CounterpartyResolver } from '../../counterparty.resolver';
import { Counterparty } from '../../entities/counterparty.entity';
import { CounterpartyService } from '../../counterparty.service';

function mockCtx(hasPermission: boolean): RequestContext {
    return { userHasPermissions: vi.fn(() => hasPermission) } as unknown as RequestContext;
}

const counterparty = { creditLimit: 500000, creditBalance: 350000 } as Counterparty;

describe('CounterpartyCreditResolver', () => {
    const resolver = new CounterpartyCreditResolver();

    it('returns creditLimit/creditBalance for a caller with ReadCounterpartyCredit', () => {
        const ctx = mockCtx(true);
        expect(resolver.creditLimit(ctx, counterparty)).toBe(500000);
        expect(resolver.creditBalance(ctx, counterparty)).toBe(350000);
    });

    it('throws ForbiddenError for a caller without ReadCounterpartyCredit, never returning the value', () => {
        const ctx = mockCtx(false);
        expect(() => resolver.creditLimit(ctx, counterparty)).toThrow(ForbiddenError);
        expect(() => resolver.creditBalance(ctx, counterparty)).toThrow(ForbiddenError);
    });
});

// Regression coverage for the credit-visibility bypass found while adding pagination for issue
// #39: counterpartySummary/highUsageCounterparties compute their credit-derived values via a
// plain SQL aggregate (CounterpartyService.getSummary/findHighUsage), which does NOT go through
// CounterpartyCreditResolver's field-level @ResolveField gate — a caller lacking
// ReadCounterpartyCredit could otherwise read the company-wide credit total even though every
// single customer's own creditLimit/creditBalance field is hidden from them. The resolver must
// gate this explicitly itself.
describe('CounterpartyResolver credit-derived aggregate gating', () => {
    const summary = {
        totalCount: 10,
        activeCount: 8,
        totalCreditBalance: 999_999,
        highUsageCount: 3,
    };
    const mockService = {
        getSummary: vi.fn(async () => summary),
        findHighUsage: vi.fn(async () => [counterparty]),
    } as unknown as CounterpartyService;
    const resolver = new CounterpartyResolver(mockService);

    it('counterpartySummary nulls out totalCreditBalance/highUsageCount without ReadCounterpartyCredit, keeps totalCount/activeCount', async () => {
        const result = await resolver.counterpartySummary(mockCtx(false));
        expect(result).toEqual({
            totalCount: 10,
            activeCount: 8,
            totalCreditBalance: null,
            highUsageCount: null,
        });
    });

    it('counterpartySummary returns real totalCreditBalance/highUsageCount with ReadCounterpartyCredit', async () => {
        const result = await resolver.counterpartySummary(mockCtx(true));
        expect(result).toEqual(summary);
    });

    it('highUsageCounterparties returns an empty list without ReadCounterpartyCredit (never calls the service)', async () => {
        const result = await resolver.highUsageCounterparties(mockCtx(false), { limit: 5 });
        expect(result).toEqual([]);
        expect(mockService.findHighUsage).not.toHaveBeenCalled();
    });

    it('highUsageCounterparties returns the real list with ReadCounterpartyCredit', async () => {
        const result = await resolver.highUsageCounterparties(mockCtx(true), { limit: 5 });
        expect(result).toEqual([counterparty]);
    });
});
