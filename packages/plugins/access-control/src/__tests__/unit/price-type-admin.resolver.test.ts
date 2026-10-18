import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { CustomerPriceTypeResolver, PriceTypeAdminResolver } from '../../price-type-admin.resolver';

const ctx = {} as RequestContext;
const types = [{ code: 'retail' }, { code: 'purchase' }];

describe('PriceTypeAdminResolver', () => {
    const pricing = {
        findAllPriceTypes: vi.fn(async () => types),
        findPriceTypeByCode: vi.fn(
            async (_c: unknown, code: string) => types.find(t => t.code === code) ?? null,
        ),
        upsertPriceType: vi.fn(),
    };
    const access = {
        allowedCodes: vi.fn(async () => ['retail']),
        assertCodeAllowed: vi.fn(async (_c: unknown, code: string) => {
            if (code !== 'retail') throw new ForbiddenError();
        }),
    };
    const resolver = new PriceTypeAdminResolver(pricing as never, access as never);

    it('priceTypes returns only allowed types', async () => {
        expect(await resolver.priceTypes(ctx)).toEqual([{ code: 'retail' }]);
    });

    it('upsertPriceType refuses to rename a hidden type', async () => {
        await expect(
            resolver.upsertPriceType(ctx, { code: 'purchase', name: 'X' }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(pricing.upsertPriceType).not.toHaveBeenCalled();
    });
});

describe('CustomerPriceTypeResolver', () => {
    it('shows the customer own type only when access allows it in that context', async () => {
        const own = { code: 'wholesale' };
        const pricing = { getCustomerPriceType: vi.fn(async () => own) };
        const isCodeAllowed = vi.fn(async () => true);
        const resolver = new CustomerPriceTypeResolver(
            pricing as never,
            { isCodeAllowed } as never,
        );
        expect(await resolver.priceType(ctx, { id: 'c1' })).toBe(own);
        expect(isCodeAllowed).toHaveBeenCalledWith(ctx, 'wholesale', {
            contextCodes: ['wholesale'],
        });
        isCodeAllowed.mockResolvedValueOnce(false);
        expect(await resolver.priceType(ctx, { id: 'c1' })).toBeNull();
    });
});
