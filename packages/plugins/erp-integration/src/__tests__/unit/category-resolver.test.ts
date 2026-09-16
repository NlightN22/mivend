import { describe, it, expect } from 'vitest';

import { resolveCategoryFacetValueId } from '../../category-resolver';

describe('resolveCategoryFacetValueId', () => {
    it('resolves a known category_id to its facet value id, without a flag', () => {
        const map = new Map([['cat-1', 'fv-1']]);

        const result = resolveCategoryFacetValueId('cat-1', map);

        expect(result).toEqual({ facetValueId: 'fv-1' });
    });

    it('flags reason "absent" when category_id is undefined', () => {
        const result = resolveCategoryFacetValueId(undefined, new Map());

        expect(result.facetValueId).toBeUndefined();
        expect(result.flag).toEqual(expect.objectContaining({ reason: 'absent' }));
    });

    it('flags reason "not-found" when category_id has no matching facet value yet', () => {
        const map = new Map([['cat-1', 'fv-1']]);

        const result = resolveCategoryFacetValueId('cat-unknown', map);

        expect(result.facetValueId).toBeUndefined();
        expect(result.flag).toEqual(
            expect.objectContaining({
                reason: 'not-found',
                detail: expect.stringContaining('cat-unknown'),
            }),
        );
    });
});
