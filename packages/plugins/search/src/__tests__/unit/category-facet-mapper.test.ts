import type { Collection, RequestContext, TransactionalConnection } from '@vendure/core';
import { describe, expect, it } from 'vitest';

import { mapFacetsToCollections } from '../../category-facet-mapper';

function connectionReturning(collections: unknown[]): TransactionalConnection {
    const qb = {
        leftJoinAndSelect: () => qb,
        where: () => qb,
        getMany: async () => collections,
    };
    return { getRepository: () => ({ createQueryBuilder: () => qb }) } as never;
}

const collection = (slug: string): Collection =>
    ({ id: slug, translations: [{ slug }] }) as unknown as Collection;
const run = (conn: TransactionalConnection, category?: Array<{ value: string; count: number }>) =>
    mapFacetsToCollections(conn, {} as RequestContext, { manufacturer: [], category });

describe('mapFacetsToCollections', () => {
    it('keeps counts for known ids and skips unknown ones', async () => {
        const result = await run(connectionReturning([collection('cat-a'), collection('cat-b')]), [
            { value: 'a', count: 7 },
            { value: 'zzz', count: 2 },
            { value: 'b', count: 3 },
        ]);
        expect(result.map(r => [r.collection.id, r.count])).toEqual([
            ['cat-a', 7],
            ['cat-b', 3],
        ]);
    });

    it('returns nothing without category buckets', async () => {
        expect(await run(connectionReturning([]), undefined)).toEqual([]);
        expect(await run(connectionReturning([]), [])).toEqual([]);
    });
});
