import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { DiscountRuleAdminResolver, PriceEntryAdminResolver } from '../../price-entry.resolver';

const ctx = {} as RequestContext;

function access(allowed: string[]) {
    return {
        allowedCodes: vi.fn(async () => allowed),
        assertCodeAllowed: vi.fn(async (_c: unknown, code: string) => {
            if (!allowed.includes(code)) throw new ForbiddenError();
        }),
    };
}

describe('PriceEntryAdminResolver price type access', () => {
    it('priceTypeCodes lists only allowed codes', async () => {
        const entries = { getForVariants: vi.fn() };
        const resolver = new PriceEntryAdminResolver(entries as never, access(['retail']) as never);
        expect(await resolver.priceTypeCodes(ctx)).toEqual(['retail']);
    });

    it('priceEntriesForVariants by a hidden code is Forbidden and reads nothing', async () => {
        const entries = { getForVariants: vi.fn(async () => new Map([['v1', 5]])) };
        const resolver = new PriceEntryAdminResolver(entries as never, access(['retail']) as never);
        await expect(
            resolver.priceEntriesForVariants(ctx, {
                variantIds: ['v1'],
                priceTypeCode: 'purchase',
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(entries.getForVariants).not.toHaveBeenCalled();
        expect(
            await resolver.priceEntriesForVariants(ctx, {
                variantIds: ['v1'],
                priceTypeCode: 'retail',
            }),
        ).toEqual([{ variantId: 'v1', price: 5 }]);
    });

    it('upsert and bulk upsert refuse a hidden code', async () => {
        const entries = { upsert: vi.fn(), bulkUpsert: vi.fn() };
        const resolver = new PriceEntryAdminResolver(entries as never, access(['retail']) as never);
        await expect(
            resolver.upsertPriceEntry(ctx, { variantId: 'v', priceTypeCode: 'purchase', price: 1 }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
            resolver.bulkUpsertPriceEntries(ctx, {
                entries: [
                    { variantId: 'v', priceTypeCode: 'retail', price: 1 },
                    { variantId: 'v', priceTypeCode: 'purchase', price: 1 },
                ],
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(entries.upsert).not.toHaveBeenCalled();
        expect(entries.bulkUpsert).not.toHaveBeenCalled();
    });
});

describe('DiscountRuleAdminResolver price type access', () => {
    it('an unfiltered list is narrowed to allowed codes; a hidden filter is Forbidden', async () => {
        const rules = { findByPriceType: vi.fn(async () => []), upsert: vi.fn() };
        const resolver = new DiscountRuleAdminResolver(rules as never, access(['retail']) as never);
        await resolver.discountRules(ctx, {});
        expect(rules.findByPriceType).toHaveBeenCalledWith(ctx, undefined, 200, ['retail']);
        await expect(
            resolver.discountRules(ctx, { priceTypeCode: 'purchase' }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
            resolver.upsertDiscountRule(ctx, { input: { priceTypeCode: 'purchase' } as never }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(rules.upsert).not.toHaveBeenCalled();
    });
});
