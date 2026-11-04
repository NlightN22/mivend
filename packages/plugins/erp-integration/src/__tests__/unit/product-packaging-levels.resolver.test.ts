import { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { ProductPackagingLevelsResolver } from '../../product-packaging-levels.resolver';
import { ProductPackagingLevelsService } from '../../product-packaging-levels.service';
import { SearchResultPackagingLevelsService } from '../../search-result-packaging-levels.service';

function build(getForProducts: ReturnType<typeof vi.fn>): ProductPackagingLevelsResolver {
    return new ProductPackagingLevelsResolver(
        new SearchResultPackagingLevelsService({
            getForProducts,
        } as unknown as ProductPackagingLevelsService),
    );
}

describe('Product.packagingLevels', () => {
    it('reads the levels of every cart line product with one query and keeps them apart', async () => {
        const getForProducts = vi.fn(
            async () =>
                new Map([
                    ['1', [{ name: 'pack', ratioToBase: 6 }]],
                    ['3', [{ name: 'pallet', ratioToBase: 60 }]],
                ]),
        );
        const resolver = build(getForProducts);
        const ctx = {} as RequestContext;

        const results = await Promise.all(
            ['1', '2', '3', '1'].map(id => resolver.packagingLevels(ctx, { id })),
        );

        expect(getForProducts).toHaveBeenCalledTimes(1);
        expect(results).toEqual([
            [{ name: 'pack', ratioToBase: 6 }],
            [],
            [{ name: 'pallet', ratioToBase: 60 }],
            [{ name: 'pack', ratioToBase: 6 }],
        ]);
    });

    it('does not share a batch between two requests in the same tick', async () => {
        const getForProducts = vi.fn(async (_ctx: unknown, ids: string[]) =>
            ids.length === 1 && ids[0] === '1'
                ? new Map([['1', [{ name: 'a', ratioToBase: 2 }]]])
                : new Map([['1', [{ name: 'b', ratioToBase: 3 }]]]),
        );
        const resolver = build(getForProducts);
        const [a, b] = await Promise.all([
            resolver.packagingLevels({} as RequestContext, { id: '1' }),
            resolver.packagingLevels({} as RequestContext, { id: '1' }),
        ]);
        expect(getForProducts).toHaveBeenCalledTimes(2);
        expect(a).toEqual([{ name: 'a', ratioToBase: 2 }]);
        expect(b).toEqual([{ name: 'a', ratioToBase: 2 }]);
    });

    it('rejects every waiting line when the query fails instead of returning empty levels', async () => {
        const resolver = build(
            vi.fn(async () => {
                throw new Error('db down');
            }),
        );
        const ctx = {} as RequestContext;
        const results = await Promise.allSettled([
            resolver.packagingLevels(ctx, { id: '1' }),
            resolver.packagingLevels(ctx, { id: '2' }),
        ]);
        expect(results.map(r => r.status)).toEqual(['rejected', 'rejected']);
    });
});
