import { describe, it, expect, vi } from 'vitest';
import { ForbiddenError, RequestContext } from '@vendure/core';

import { CounterpartyCreditResolver } from '../../counterparty.resolver';
import { Counterparty } from '../../entities/counterparty.entity';

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
