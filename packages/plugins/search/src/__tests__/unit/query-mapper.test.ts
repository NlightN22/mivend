import { describe, expect, it } from 'vitest';

import { mapSearchInputToResolveQueryRequest } from '../../query-mapper';

// Issue #69, test-design coverage area 1: SearchInput.term/take/skip -> search-service's
// query/limit/offset request shape.
describe('mapSearchInputToResolveQueryRequest', () => {
    it('maps term/take/skip to query/limit/offset', () => {
        const request = mapSearchInputToResolveQueryRequest({
            term: 'brake pad',
            take: 10,
            skip: 20,
        });
        expect(request).toEqual({ query: 'brake pad', limit: 10, offset: 20 });
    });

    it('maps a missing term to an empty query string, and missing take/skip to undefined', () => {
        const request = mapSearchInputToResolveQueryRequest({});
        expect(request).toEqual({ query: '', limit: undefined, offset: undefined });
    });

    // Audit finding, mivend.audit.70: search-service has no collection/facet/sort support —
    // silently dropping these would return an unfiltered global result set for a category or
    // faceted-filter page, so mapping must fail loud instead.
    it.each([
        ['collectionId', { collectionId: 'coll-1' }],
        ['collectionIds', { collectionIds: ['coll-1'] }],
        ['collectionSlug', { collectionSlug: 'brakes' }],
        ['collectionSlugs', { collectionSlugs: ['brakes'] }],
        ['facetValueFilters', { facetValueFilters: [{ and: 'fv-1' }] }],
        ['facetValueIds', { facetValueIds: ['fv-1'] }],
        ['groupByProduct', { groupByProduct: true }],
        ['sort', { sort: { name: 'ASC' } }],
    ])('throws when SearchInput carries an unsupported filter (%s)', (_label, extra) => {
        expect(() =>
            mapSearchInputToResolveQueryRequest({ term: 'brake pad', ...extra } as never),
        ).toThrow(/does not support/);
    });
});
