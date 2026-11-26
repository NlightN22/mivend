import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderLineResolver } from '../../handlers/order-line-resolver';
import { MissingDependencyError } from '../../types';

const ctx = {} as RequestContext;

function setup(
    variant: Record<string, unknown> | undefined,
    unit: { ratioToBase: number | null } | null = null,
) {
    const query = vi.fn(async (_sql: string, params: string[][]) =>
        variant ? params[0].map(externalId => ({ ...variant, externalId })) : [],
    );
    const findByEntityId = vi.fn().mockResolvedValue(unit);
    const resolver = new OrderLineResolver(
        { getRepository: () => ({ query }) } as never,
        { findByEntityId } as never,
    );
    return { resolver, findByEntityId };
}

const variant = { id: 7, defaultSalesUnitId: 'u-box', unitRatioToBase: 10 };

describe('OrderLineResolver', () => {
    it('maps a product id to the variant id as a string (Postgres returns the integer id as a number)', async () => {
        const { resolver } = setup({ id: 7, defaultSalesUnitId: null, unitRatioToBase: null });
        const result = await resolver.resolve(
            ctx,
            'order-state',
            'o-1',
            [{ productId: 'p-1' }],
            false,
        );
        expect(result.lines).toEqual([
            { productVariantId: '7', ratioToBase: 1, raw: { productId: 'p-1' } },
        ]);
    });

    it('uses the variant own ratio for its default sales unit, without a unit lookup', async () => {
        const { resolver, findByEntityId } = setup(variant);
        const result = await resolver.resolve(
            ctx,
            'order-state',
            'o-1',
            [{ productId: 'p-1', unitId: 'u-box' }],
            false,
        );
        expect(result.lines[0].ratioToBase).toBe(10);
        expect(findByEntityId).not.toHaveBeenCalled();
    });

    it('reads another unit through the unit lookup and an unknown unit as base', async () => {
        const known = setup(variant, { ratioToBase: 4 });
        expect(
            (
                await known.resolver.resolve(
                    ctx,
                    'order-state',
                    'o-1',
                    [{ productId: 'p-1', unitId: 'u-pack' }],
                    false,
                )
            ).lines[0].ratioToBase,
        ).toBe(4);
        const unknown = setup(variant, null);
        expect(
            (
                await unknown.resolver.resolve(
                    ctx,
                    'order-state',
                    'o-1',
                    [{ productId: 'p-1', unitId: 'u-gone' }],
                    false,
                )
            ).lines[0].ratioToBase,
        ).toBe(1);
    });

    it('retries (MissingDependencyError) for an unknown product unless unknown ones are tolerated', async () => {
        const { resolver } = setup(undefined);
        await expect(
            resolver.resolve(ctx, 'order-state', 'o-1', [{ productId: 'p-1' }], false),
        ).rejects.toBeInstanceOf(MissingDependencyError);
        const tolerated = await resolver.resolve(
            ctx,
            'order-changed',
            'o-1',
            [{ productId: 'p-1' }],
            true,
        );
        expect(tolerated).toMatchObject({ lines: [], unknownProducts: 1, withoutProductId: 0 });
    });

    it('drops and counts a line with a missing productId', async () => {
        const { resolver } = setup(variant);
        const result = await resolver.resolve(ctx, 'order-state', 'o-1', [{ quantity: 1 }], false);
        expect(result).toMatchObject({ lines: [], withoutProductId: 1 });
    });
});
