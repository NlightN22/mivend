import type { Product, RequestContext, TransactionalConnection } from '@vendure/core';
import { QueryTooLargeError } from 'shared';
import { describe, expect, it } from 'vitest';

import { ExternalCollectionResult, mapFacetsToCollections } from '../../category-facet-mapper';
import { ExternalFacetValueResult, mapFacetsToFacetValues } from '../../facet-mapper';
import { ProductLookupService } from '../../product-lookup.service';

const ctx = { channelId: 1 } as RequestContext;

function connectionReturning(rows: unknown[]): TransactionalConnection {
    const qb: Record<string, unknown> = { getMany: async () => rows };
    for (const m of ['leftJoinAndSelect', 'innerJoin', 'where', 'andWhere', 'take'])
        qb[m] = () => qb;
    return { getRepository: () => ({ createQueryBuilder: () => qb }) } as never;
}

const rows = (n: number, make: (i: number) => unknown): unknown[] =>
    Array.from({ length: n }, (_, i) => make(i));
const bucket = (n: number): unknown[] => rows(n, i => ({ value: `m${i}`, count: 1 }));

describe('search id-list reads state their ceiling', () => {
    it('category facets: one collection per slug passes, one over throws', async () => {
        const collection = (i: number): { id: number; translations: { slug: string }[] } => ({
            id: i,
            translations: [{ slug: `cat-m${i}` }],
        });
        const run = (found: number): Promise<ExternalCollectionResult[]> =>
            mapFacetsToCollections(connectionReturning(rows(found, collection)), ctx, {
                manufacturer: [],
                category: bucket(2),
            } as never);
        await expect(run(2)).resolves.toHaveLength(2);
        await expect(run(3)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('manufacturer facets: one value per code passes, one over throws', async () => {
        interface ValueResult2 {
            id: number;
            code: string;
            facet: { code: string };
            translations: { name: string }[];
        }

        const value = (i: number): ValueResult2 => ({
            id: i,
            code: `m${i}`,
            facet: { code: 'manufacturer' },
            translations: [{ name: `Name ${i}` }],
        });
        const run = (found: number): Promise<ExternalFacetValueResult[]> =>
            mapFacetsToFacetValues(connectionReturning(rows(found, value)), ctx, {
                manufacturer: bucket(2),
            } as never);
        await expect(run(2)).resolves.toHaveLength(2);
        await expect(run(3)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('characteristic facets: the facet x code cross product is the ceiling', async () => {
        interface ValueResult {
            id: number;
            code: string;
            facet: { code: string };
            translations: never[];
        }

        const value = (i: number): ValueResult => ({
            id: i,
            code: 'x',
            facet: { code: 'f' },
            translations: [],
        });
        const run = (found: number): Promise<ExternalFacetValueResult[]> =>
            mapFacetsToFacetValues(connectionReturning(rows(found, value)), ctx, {
                manufacturer: [],
                characteristics: [{ key: 'k', normalized: 'x', count: 1 }],
            } as never);
        await expect(run(1)).resolves.toBeDefined();
        await expect(run(2)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('product lookup by external ids: one product per id passes, one over throws', async () => {
        const product = (i: number): { id: number; customFields: { externalId: string } } => ({
            id: i,
            customFields: { externalId: `e${i}` },
        });
        const run = (found: number): Promise<Map<string, Product>> =>
            new ProductLookupService(connectionReturning(rows(found, product))).findByExternalIds(
                ctx,
                ['e0', 'e1'],
            );
        expect((await run(2)).size).toBe(2);
        await expect(run(3)).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
