import { describe, expect, it } from 'vitest';

import {
    hasBrowseCriteria,
    hasPriceCriteria,
    mapSearchInputToResolveQueryRequest,
    type ResolveQueryRequest,
} from '../../query-mapper';

const none = { manufacturer: [] as string[], characteristics: [], unsatisfiable: false };

describe('mapSearchInputToResolveQueryRequest', () => {
    it('maps term/take/skip to query/limit/offset with relevance sort', () => {
        expect(
            mapSearchInputToResolveQueryRequest({ term: 'pad', take: 10, skip: 20 }, none),
        ).toEqual({
            query: 'pad',
            sort: 'relevance',
            availableOnly: false,
            limit: 10,
            offset: 20,
        });
    });

    it('sends limit 1 for a facets-only request (take 0), which search-service would reject', () => {
        expect(mapSearchInputToResolveQueryRequest({ term: 'pad', take: 0 }, none).limit).toBe(1);
    });

    it('passes resolved category and manufacturer filters', () => {
        const request = mapSearchInputToResolveQueryRequest(
            {},
            {
                categoryId: 'cat-1',
                manufacturer: ['m-1', 'm-2'],
                characteristics: [],
                unsatisfiable: false,
            },
        );
        expect(request).toMatchObject({
            query: '',
            categoryId: 'cat-1',
            filters: { manufacturer: ['m-1', 'm-2'] },
        });
    });

    it('inStock narrows availability to the viewer branch warehouses', () => {
        const request = mapSearchInputToResolveQueryRequest(
            { term: 'oil', inStock: true },
            { manufacturer: [], characteristics: [], warehouseIds: ['wh-1'], unsatisfiable: false },
        );
        expect(request).toMatchObject({
            availableOnly: true,
            filters: { warehouseIds: ['wh-1'] },
        });
    });

    it('an empty warehouse list is still sent (no visible stock means no results, not all)', () => {
        const request = mapSearchInputToResolveQueryRequest(
            { term: 'oil', inStock: true },
            { manufacturer: [], characteristics: [], warehouseIds: [], unsatisfiable: false },
        );
        expect(request.filters).toEqual({ warehouseIds: [] });
    });

    it('without inStock availableOnly is explicitly false (search-service defaults to true) and no warehouseIds are sent', () => {
        const request = mapSearchInputToResolveQueryRequest({ term: 'oil' }, none);
        expect(request.availableOnly).toBe(false);
        expect(request).not.toHaveProperty('filters');
    });

    it.each([
        [{ name: 'ASC' }, 'name'],
        [{ name: 'DESC' }, 'nameDesc'],
        [{ price: 'ASC' }, 'priceAsc'],
        [{ price: 'DESC' }, 'priceDesc'],
    ])('maps sort %o to %s', (sort, expected) => {
        expect(mapSearchInputToResolveQueryRequest({ sort } as never, none).sort).toBe(expected);
    });

    it('converts the minor-unit price range to major units', () => {
        const request = mapSearchInputToResolveQueryRequest(
            { term: 'x', priceRangeWithTax: { min: 10050, max: 999_999_999 } },
            none,
        );
        expect(request.filters).toEqual({ priceRange: { min: 100.5, max: 9_999_999.99 } });
    });
});

describe('hasBrowseCriteria', () => {
    it('is false for an empty query without filters, even with a name sort', () => {
        expect(hasBrowseCriteria({ query: '' })).toBe(false);
        expect(hasBrowseCriteria({ query: '', sort: 'nameDesc' })).toBe(false);
    });
    it.each<[ResolveQueryRequest]>([
        [{ query: 'x' }],
        [{ query: '', categoryId: 'c' }],
        [{ query: '', filters: { manufacturer: ['m'] } }],
        [{ query: '', filters: { priceRange: { min: 1 } } }],
        [{ query: '', sort: 'priceAsc' }],
        [{ query: '', sort: 'priceDesc' }],
    ])('is true for %o', request => {
        expect(hasBrowseCriteria(request)).toBe(true);
    });

    it('passes characteristic filters and counts them as browse criteria', () => {
        const characteristics = [{ key: 'Тип', normalized: 'синтетическое' }];
        const request = mapSearchInputToResolveQueryRequest({}, { ...none, characteristics });
        expect(request.filters).toEqual({ characteristics });
        expect(hasBrowseCriteria(request)).toBe(true);
    });
});

describe('priceTypeId', () => {
    const guid = '3f2b8c1e-0000-4000-8000-000000000001';

    it('is included at the top level when resolved, with range and sort unchanged', () => {
        const request = mapSearchInputToResolveQueryRequest(
            {
                term: 'x',
                priceRangeWithTax: { min: 100000, max: 500000 },
                sort: { price: 'DESC' as never },
            },
            none,
            guid,
        );
        expect(request).toMatchObject({
            priceTypeId: guid,
            filters: { priceRange: { min: 1000, max: 5000 } },
            sort: 'priceDesc',
        });
    });

    it.each([[null], [undefined]])('is omitted when unresolved (%s)', value => {
        const request = mapSearchInputToResolveQueryRequest(
            { sort: { price: 'ASC' as never } },
            none,
            value,
        );
        expect(request).not.toHaveProperty('priceTypeId');
    });

    it('matches the documented request body shape', () => {
        const request = mapSearchInputToResolveQueryRequest(
            {
                term: '',
                priceRangeWithTax: { min: 100000, max: 100000 },
                sort: { price: 'ASC' as never },
            },
            none,
            guid,
        );
        expect(JSON.parse(JSON.stringify(request))).toMatchObject({
            priceTypeId: guid,
            filters: { priceRange: { min: 1000 } },
            sort: 'priceAsc',
        });
        expect(typeof request.priceTypeId).toBe('string');
    });
});

describe('hasPriceCriteria', () => {
    it('is true for a price range or price sort only', () => {
        expect(hasPriceCriteria({ priceRangeWithTax: { min: 1, max: 2 } })).toBe(true);
        expect(hasPriceCriteria({ sort: { price: 'ASC' as never } })).toBe(true);
        expect(hasPriceCriteria({ sort: { name: 'ASC' as never }, term: 'x' })).toBe(false);
    });
});
