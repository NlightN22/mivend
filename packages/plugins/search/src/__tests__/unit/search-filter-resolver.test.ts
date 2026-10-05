import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

vi.mock('@vendure/core', () => ({
    Logger: { warn: vi.fn() },
    Collection: class {},
    FacetValue: class {},
    TransactionalConnection: class {},
}));
vi.mock('@mivend/plugin-reservation', () => ({ StockLevelService: class {} }));

import { SearchFilterResolver } from '../../search-filter-resolver.service';

const ctx = {} as RequestContext;

function makeResolver(
    data: { collections?: unknown[]; facetValues?: unknown[] },
    warehouseIds: string[] = [],
) {
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
    const stockLevelService = { getViewerWarehouseErpIds: vi.fn(async () => warehouseIds) };
    return new SearchFilterResolver(connection as never, stockLevelService as never);
}

describe('SearchFilterResolver', () => {
    it('derives the category id from a collection slug', async () => {
        const r = await makeResolver({}).resolve(ctx, { collectionSlug: 'cat-abc' });
        expect(r).toMatchObject({ categoryId: 'abc', manufacturer: [], unsatisfiable: false });
    });

    it('marks a slug that is not a category as unsatisfiable instead of dropping it', async () => {
        const r = await makeResolver({}).resolve(ctx, { collectionSlug: 'other' });
        expect(r).toMatchObject({ categoryId: undefined, unsatisfiable: true });
    });

    it('marks a collection id that does not exist as unsatisfiable', async () => {
        const r = await makeResolver({ collections: [] }).resolve(ctx, { collectionId: '9' });
        expect(r.unsatisfiable).toBe(true);
    });

    it('marks an unknown facet value id as unsatisfiable', async () => {
        const facetValues = [{ code: 'm-1', facet: { code: 'manufacturer' } }];
        const r = await makeResolver({ facetValues }).resolve(ctx, {
            facetValueFilters: [{ or: ['1', '2'] }],
        });
        expect(r).toMatchObject({ manufacturer: ['m-1'], unsatisfiable: true });
    });

    it('marks an unsupported facet (characteristics) as unsatisfiable', async () => {
        const facetValues = [{ code: 'x', facet: { code: 'color' } }];
        const r = await makeResolver({ facetValues }).resolve(ctx, { facetValueIds: ['1'] });
        expect(r.unsatisfiable).toBe(true);
    });

    it('maps manufacturer facet values (ids and and/or filters) to ERP codes', async () => {
        const facetValues = [
            { code: 'm-1', facet: { code: 'manufacturer' } },
            { code: 'm-2', facet: { code: 'manufacturer' } },
            { code: 'm-3', facet: { code: 'manufacturer' } },
        ];
        const r = await makeResolver({ facetValues }).resolve(ctx, {
            facetValueIds: ['1'],
            facetValueFilters: [{ or: ['2', '3'] }],
        });
        expect(r).toMatchObject({ manufacturer: ['m-1', 'm-2', 'm-3'], unsatisfiable: false });
    });

    it('resolves a collection id via its translated slug', async () => {
        const collections = [{ translations: [{ slug: 'cat-zzz' }] }];
        const r = await makeResolver({ collections }).resolve(ctx, { collectionId: '5' });
        expect(r.categoryId).toBe('zzz');
    });

    it('resolves the viewer branch warehouse ids only when the inStock filter is on', async () => {
        const resolver = makeResolver({}, ['wh-1', 'wh-2']);
        expect((await resolver.resolve(ctx, {})).warehouseIds).toBeUndefined();
        expect((await resolver.resolve(ctx, { inStock: false })).warehouseIds).toBeUndefined();
        expect((await resolver.resolve(ctx, { inStock: true })).warehouseIds).toEqual([
            'wh-1',
            'wh-2',
        ]);
    });

    it('maps characteristic facet values to key + normalized filters', async () => {
        const facetValues = [
            { code: 'синтетическое', facet: { code: 'characteristic:Тип' } },
            { code: 'SN', facet: { code: 'characteristic:Классификация API' } },
        ];
        const r = await makeResolver({ facetValues }).resolve(ctx, {
            facetValueFilters: [{ or: ['1', '2'] }],
        });
        expect(r.characteristics).toEqual([
            { key: 'Тип', normalized: 'синтетическое' },
            { key: 'Классификация API', normalized: 'SN' },
        ]);
        expect(r.unsatisfiable).toBe(false);
    });
});
