import { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { ProductPackagingLevelsService } from '../../product-packaging-levels.service';
import { SearchResultPackagingLevelsService } from '../../search-result-packaging-levels.service';

describe('SearchResultPackagingLevelsService', () => {
    it('fetches levels for many results with one query and keeps products apart', async () => {
        const getForProducts = vi.fn(
            async () => new Map([['1', [{ name: 'pack', ratioToBase: 12 }]]]),
        );
        const service = new SearchResultPackagingLevelsService({
            getForProducts,
        } as unknown as ProductPackagingLevelsService);
        const ctx = {} as RequestContext;

        const [a, b, c] = await Promise.all([
            service.load(ctx, '1'),
            service.load(ctx, '2'),
            service.load(ctx, '1'),
        ]);

        expect(getForProducts).toHaveBeenCalledTimes(1);
        expect(getForProducts).toHaveBeenCalledWith(ctx, ['1', '2']);
        expect(a).toEqual([{ name: 'pack', ratioToBase: 12 }]);
        expect(c).toEqual(a);
        expect(b).toEqual([]);
    });
});

describe('SearchResultPackagingLevelsService garbage ids', () => {
    it('does not pass non-numeric ids to the query and still resolves the others', async () => {
        const getForProducts = vi.fn(
            async () => new Map([['1', [{ name: 'pack', ratioToBase: 12 }]]]),
        );
        const service = new SearchResultPackagingLevelsService({
            getForProducts,
        } as unknown as ProductPackagingLevelsService);
        const ctx = {} as RequestContext;

        const [good, bad, empty] = await Promise.all([
            service.load(ctx, '1'),
            service.load(ctx, 'abc'),
            service.load(ctx, ''),
        ]);

        expect(getForProducts).toHaveBeenCalledWith(ctx, ['1']);
        expect(good).toHaveLength(1);
        expect(bad).toEqual([]);
        expect(empty).toEqual([]);
    });
});
