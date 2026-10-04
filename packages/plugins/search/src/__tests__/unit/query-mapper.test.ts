import { describe, expect, it, vi } from 'vitest';

vi.mock('@vendure/core', () => ({ Logger: { warn: vi.fn(), error: vi.fn() } }));

import { Logger } from '@vendure/core';
import { hasBrowseCriteria, mapSearchInputToResolveQueryRequest } from '../../query-mapper';

const none = { manufacturer: [] as string[], unsatisfiable: false };

describe('mapSearchInputToResolveQueryRequest', () => {
    it('maps term/take/skip to query/limit/offset with relevance sort', () => {
        expect(
            mapSearchInputToResolveQueryRequest({ term: 'pad', take: 10, skip: 20 }, none),
        ).toEqual({
            query: 'pad',
            sort: 'relevance',
            limit: 10,
            offset: 20,
        });
    });

    it('passes resolved category and manufacturer filters', () => {
        const request = mapSearchInputToResolveQueryRequest(
            {},
            { categoryId: 'cat-1', manufacturer: ['m-1', 'm-2'], unsatisfiable: false },
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
            { manufacturer: [], warehouseIds: ['wh-1'], unsatisfiable: false },
        );
        expect(request).toMatchObject({
            availableOnly: true,
            filters: { warehouseIds: ['wh-1'] },
        });
    });

    it('an empty warehouse list is still sent (no visible stock means no results, not all)', () => {
        const request = mapSearchInputToResolveQueryRequest(
            { term: 'oil', inStock: true },
            { manufacturer: [], warehouseIds: [], unsatisfiable: false },
        );
        expect(request.filters).toEqual({ warehouseIds: [] });
    });

    it('without inStock neither availableOnly nor warehouseIds is sent', () => {
        const request = mapSearchInputToResolveQueryRequest({ term: 'oil' }, none);
        expect(request).not.toHaveProperty('availableOnly');
        expect(request).not.toHaveProperty('filters');
    });

    it('maps name ASC sort to name', () => {
        expect(
            mapSearchInputToResolveQueryRequest({ sort: { name: 'ASC' } } as never, none).sort,
        ).toBe('name');
    });

    it.each([{ price: 'ASC' }, { name: 'DESC' }])(
        'degrades unsupported sort %o to relevance with a warning',
        sort => {
            vi.mocked(Logger.warn).mockClear();
            const request = mapSearchInputToResolveQueryRequest({ sort } as never, none);
            expect(request.sort).toBe('relevance');
            expect(Logger.warn).toHaveBeenCalled();
        },
    );
});

describe('hasBrowseCriteria', () => {
    it('is false for an empty query without filters', () => {
        expect(hasBrowseCriteria({ query: '' })).toBe(false);
    });
    it.each([
        [{ query: 'x' }],
        [{ query: '', categoryId: 'c' }],
        [{ query: '', filters: { manufacturer: ['m'] } }],
    ])('is true for %o', request => {
        expect(hasBrowseCriteria(request)).toBe(true);
    });
});
