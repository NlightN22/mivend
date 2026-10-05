import { describe, expect, it } from 'vitest';

import {
    hasBrowseCriteria,
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
