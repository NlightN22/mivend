import { describe, expect, it, vi } from 'vitest';
import type { TransactionalConnection } from '@vendure/core';

import { SearchResultAvailabilityResolver } from '../../search-result-availability.resolver';

const resolverWith = (rows: unknown[]) => {
    const query = vi.fn().mockResolvedValue(rows);
    const connection = { rawConnection: { query } } as unknown as TransactionalConnection;
    return { resolver: new SearchResultAvailabilityResolver(connection), query };
};

describe('SearchResultAvailabilityResolver', () => {
    it('is available when the variant row has an organization', async () => {
        const { resolver, query } = resolverWith([{ '?column?': 1 }]);
        expect(await resolver.availableForOrder({ productVariantId: '5' })).toBe(true);
        expect(query).toHaveBeenCalledWith(expect.any(String), ['5']);
    });

    it('is unavailable when no variant row has an organization', async () => {
        expect(await resolverWith([]).resolver.availableForOrder({ productVariantId: '5' })).toBe(
            false,
        );
    });
});
