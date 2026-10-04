import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

vi.mock('@vendure/core', () => ({
    Logger: { warn: vi.fn() },
    Collection: class {},
    FacetValue: class {},
    TransactionalConnection: class {},
}));

import { SearchFilterResolver } from '../../search-filter-resolver.service';

const ctx = {} as RequestContext;

function makeResolver(data: { collections?: unknown[]; facetValues?: unknown[] }) {
    const qbFor = (rows: unknown[]) => {
        const qb: Record<string, unknown> = {};
        for (const m of ['leftJoinAndSelect', 'whereInIds']) qb[m] = () => qb;
        qb.getMany = async () => rows;
        return qb;
    };
    const connection = {
        getRepository: (_ctx: unknown, entity: { name?: string }) => ({
            createQueryBuilder: () =>
                qbFor(
                    entity.name === 'Collection'
                        ? (data.collections ?? [])
                        : (data.facetValues ?? []),
                ),
        }),
    };
    return new SearchFilterResolver(connection as never);
}

describe('SearchFilterResolver', () => {
    it('derives the category id from a collection slug', async () => {
        const r = await makeResolver({}).resolve(ctx, { collectionSlug: 'cat-abc' });
        expect(r).toEqual({ categoryId: 'abc', manufacturer: [] });
    });

    it('ignores a non-category slug', async () => {
        const r = await makeResolver({}).resolve(ctx, { collectionSlug: 'other' });
        expect(r.categoryId).toBeUndefined();
    });

    it('maps manufacturer facet values (ids and and/or filters) to ERP codes and drops others', async () => {
        const facetValues = [
            { code: 'm-1', facet: { code: 'manufacturer' } },
            { code: 'm-2', facet: { code: 'manufacturer' } },
            { code: 'x', facet: { code: 'color' } },
        ];
        const r = await makeResolver({ facetValues }).resolve(ctx, {
            facetValueIds: ['1'],
            facetValueFilters: [{ or: ['2', '3'] }],
        });
        expect(r.manufacturer).toEqual(['m-1', 'm-2']);
    });

    it('resolves a collection id via its translated slug', async () => {
        const collections = [{ translations: [{ slug: 'cat-zzz' }] }];
        const r = await makeResolver({ collections }).resolve(ctx, { collectionId: '5' });
        expect(r.categoryId).toBe('zzz');
    });
});
