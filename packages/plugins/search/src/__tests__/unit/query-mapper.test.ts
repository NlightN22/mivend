import { describe, expect, it, vi } from 'vitest';

vi.mock('@vendure/core', () => ({ Logger: { warn: vi.fn(), error: vi.fn() } }));

import { Logger } from '@vendure/core';
import { mapSearchInputToResolveQueryRequest } from '../../query-mapper';

// Issue #69, test-design coverage area 1: SearchInput.term/take/skip -> search-service's
// query/limit/offset request shape.
describe('mapSearchInputToResolveQueryRequest', () => {
    it('maps term/take/skip to query/limit/offset', () => {
        const { request, unsupportedFiltersDropped } = mapSearchInputToResolveQueryRequest({
            term: 'brake pad',
            take: 10,
            skip: 20,
        });
        expect(request).toEqual({ query: 'brake pad', limit: 10, offset: 20 });
        expect(unsupportedFiltersDropped).toBe(false);
    });

    it('maps a missing term to an empty query string, and missing take/skip to undefined', () => {
        const { request } = mapSearchInputToResolveQueryRequest({});
        expect(request).toEqual({ query: '', limit: undefined, offset: undefined });
    });

    // Audit finding, mivend.audit.70 (round 3): search-service has no collection/facet/sort
    // support. A prior fix made this throw, which turned every real facet-filter click under
    // SEARCH_BACKEND=external into a hard shop-api failure (a production availability
    // regression) — the resolution is to degrade instead: drop the field, still run the
    // free-text query, and flag it so the caller/logs know filtering was skipped.
    it.each([
        ['collectionId', { collectionId: 'coll-1' }],
        ['collectionIds', { collectionIds: ['coll-1'] }],
        ['collectionSlug', { collectionSlug: 'brakes' }],
        ['collectionSlugs', { collectionSlugs: ['brakes'] }],
        ['facetValueFilters', { facetValueFilters: [{ and: 'fv-1' }] }],
        ['facetValueIds', { facetValueIds: ['fv-1'] }],
        ['groupByProduct', { groupByProduct: true }],
        ['sort', { sort: { name: 'ASC' } }],
    ])(
        'drops an unsupported filter (%s) and still runs the free-text query, without throwing',
        (_label, extra) => {
            const { request, unsupportedFiltersDropped } = mapSearchInputToResolveQueryRequest({
                term: 'brake pad',
                ...extra,
            } as never);

            expect(request).toEqual({ query: 'brake pad', limit: undefined, offset: undefined });
            expect(unsupportedFiltersDropped).toBe(true);
        },
    );

    it('logs a warning (visible to operators) whenever an unsupported filter is dropped', () => {
        vi.mocked(Logger.warn).mockClear();
        mapSearchInputToResolveQueryRequest({ term: 'x', collectionId: 'coll-1' });
        expect(Logger.warn).toHaveBeenCalledWith(
            expect.stringMatching(/does not support/),
            'SearchPlugin',
        );
    });
});
