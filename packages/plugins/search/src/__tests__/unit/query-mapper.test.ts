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
});
