import { describe, expect, it } from 'vitest';

import { categorySlugsOf, hiddenFacetValueIds } from '../../hidden-category-facet-values';

const values = [
    { id: 1, code: 'c1', facetCode: 'category' },
    { id: '2', code: 'c2', facetCode: 'category' },
    { id: 3, code: 'c1', facetCode: 'manufacturer' },
];

describe('hidden category facet values', () => {
    it('maps only category facet values to collection slugs', () => {
        expect(categorySlugsOf(values)).toEqual(['cat-c1', 'cat-c2']);
    });

    it('hides category values whose collection is private, as string ids', () => {
        expect(hiddenFacetValueIds(values, new Set(['cat-c2']))).toEqual(new Set(['2']));
    });

    it('never hides a non-category value that shares a code with a hidden category', () => {
        expect(hiddenFacetValueIds(values, new Set(['cat-c1']))).toEqual(new Set(['1']));
    });

    it('hides nothing when no category collection is private', () => {
        expect(hiddenFacetValueIds(values, new Set())).toEqual(new Set());
    });
});
