import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { CounterpartyPriceTypeResolver, CounterpartyResolver } from '../../counterparty.resolver';
import type { Counterparty } from '../../entities/counterparty.entity';

const ctx = {} as RequestContext;
const counterparty = { priceType: 'wholesale' } as Counterparty;

describe('CounterpartyPriceTypeResolver', () => {
    it('returns the type in its own context when access allows it', async () => {
        const isCodeAllowed = vi.fn(async () => true);
        const resolver = new CounterpartyPriceTypeResolver({ isCodeAllowed } as never);
        expect(await resolver.priceType(ctx, counterparty)).toBe('wholesale');
        expect(isCodeAllowed).toHaveBeenCalledWith(ctx, 'wholesale', {
            contextCodes: ['wholesale'],
        });
    });

    it('returns null when the viewer may not see the type', async () => {
        const resolver = new CounterpartyPriceTypeResolver({
            isCodeAllowed: vi.fn(async () => false),
        } as never);
        expect(await resolver.priceType(ctx, counterparty)).toBeNull();
    });
});

describe('CounterpartyResolver.upsertCounterparty price type', () => {
    it('refuses a price type the caller cannot see', async () => {
        const service = { upsert: vi.fn() };
        const resolver = new CounterpartyResolver(
            service as never,
            {} as never,
            {
                assertCodeAllowed: vi.fn(async () => {
                    throw new ForbiddenError();
                }),
            } as never,
        );
        await expect(
            resolver.upsertCounterparty(ctx, { priceType: 'purchase' } as never),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(service.upsert).not.toHaveBeenCalled();
    });
});
