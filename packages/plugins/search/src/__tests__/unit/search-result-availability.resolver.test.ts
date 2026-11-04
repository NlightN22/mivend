import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { SearchResultAvailabilityResolver } from '../../search-result-availability.resolver';

const resolverWith = (rows: Array<{ id: number }>) => {
    const query = vi.fn().mockResolvedValue(rows);
    const connection = { getRepository: () => ({ query }) } as unknown as TransactionalConnection;
    return { resolver: new SearchResultAvailabilityResolver(connection), query };
};
const ask = (
    resolver: SearchResultAvailabilityResolver,
    ctx: RequestContext,
    id: string,
): Promise<boolean> => resolver.availableForOrder(ctx, { productVariantId: id });

describe('SearchResultAvailabilityResolver', () => {
    it('resolves every card of a request with one query and marks only organization-bound variants', async () => {
        const { resolver, query } = resolverWith([{ id: 5 }, { id: 7 }]);
        const ctx = {} as RequestContext;
        const results = await Promise.all(['5', '6', '7', '5'].map(id => ask(resolver, ctx, id)));
        expect(results).toEqual([true, false, true, true]);
        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(expect.any(String), [[5, 6, 7]]);
    });

    it('does not share results between requests', async () => {
        const { resolver, query } = resolverWith([]);
        await Promise.all([
            ask(resolver, {} as RequestContext, '5'),
            ask(resolver, {} as RequestContext, '5'),
        ]);
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('treats a non-numeric id as unavailable without querying it', async () => {
        const { resolver, query } = resolverWith([]);
        expect(await ask(resolver, {} as RequestContext, 'abc')).toBe(false);
        expect(query).not.toHaveBeenCalled();
    });
});
