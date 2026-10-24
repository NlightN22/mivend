import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ProductVariantPriceResolver } from '../../price-entry.resolver';

const progress = { facetName: 'brand-a', metric: 'WEIGHT', current: 0 };

function setup(order: { lines: unknown[] } | undefined) {
    const resolveTierProgress = vi.fn(async () => progress);
    const active = { getActiveOrder: vi.fn(async () => order && { id: 1 }) };
    const findOne = vi.fn(async () => order ?? null);
    const connection = { getRepository: () => ({ findOne }) };
    const resolver = new ProductVariantPriceResolver(
        {} as never,
        active as never,
        connection as never,
        { resolveTierProgress } as never,
    );
    return { resolver, resolveTierProgress, findOne, active };
}

describe('ProductVariant.tierProgress', () => {
    it('returns null without a logged-in user', async () => {
        const { resolver, resolveTierProgress } = setup(undefined);
        const ctx = {} as RequestContext;
        expect(await resolver.tierProgress(ctx, { id: '1' })).toBeNull();
        expect(resolveTierProgress).not.toHaveBeenCalled();
    });

    it('resolves 0 of N for an empty cart', async () => {
        const { resolver, resolveTierProgress } = setup(undefined);
        const ctx = { activeUserId: 'u1' } as RequestContext;
        await resolver.tierProgress(ctx, { id: '1' });
        expect(resolveTierProgress).toHaveBeenCalledWith(
            ctx,
            '1',
            expect.objectContaining({ quantity: 0 }),
            expect.anything(),
        );
    });

    it("uses the quantity of the variant's own line in the active order", async () => {
        const order = {
            lines: [
                { productVariantId: 1, quantity: 7 },
                { productVariantId: 2, quantity: 3 },
            ],
        };
        const { resolver, resolveTierProgress } = setup(order);
        const ctx = { activeUserId: 'u1' } as RequestContext;
        await resolver.tierProgress(ctx, { id: 1 as unknown as string });
        expect(resolveTierProgress).toHaveBeenCalledWith(
            ctx,
            '1',
            { order, quantity: 7 },
            expect.anything(),
        );
    });

    it('loads only the active order, once per request, for any number of variants', async () => {
        const { resolver, findOne, active } = setup({ lines: [] });
        const ctx = { activeUserId: 'u1' } as RequestContext;
        await Promise.all(['1', '2', '3'].map(id => resolver.tierProgress(ctx, { id })));
        expect(active.getActiveOrder).toHaveBeenCalledTimes(1);
        expect(findOne).toHaveBeenCalledTimes(1);
        expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
    });
});
