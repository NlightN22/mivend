import { describe, expect, it } from 'vitest';

import {
    expandCategoryFilters,
    visibleSubtreeFacetValueIds,
    type CategoryNodeRow,
} from '../../category-subtree-expansion';

const node = (
    id: number,
    parentId: number | null,
    facetValueId: number | null,
    isPrivate = false,
): CategoryNodeRow => ({ collectionId: id, parentId, facetValueId, isPrivate });

// root(1) > parent(2, fv 20) > [child(3, fv 30) > grand(6, fv 60), hidden(4, fv 40) > hiddenKid(5, fv 50)]
const rows = [
    node(1, null, null),
    node(2, 1, 20),
    node(3, 2, 30),
    node(4, 2, 40, true),
    node(5, 4, 50),
    node(6, 3, 60),
];

describe('visibleSubtreeFacetValueIds', () => {
    const descendantsOf = visibleSubtreeFacetValueIds(rows);

    it('returns visible children and grandchildren', () => {
        expect(descendantsOf('20').sort()).toEqual(['30', '60']);
        expect(descendantsOf('30')).toEqual(['60']);
    });

    it('drops a hidden category and everything below it', () => {
        expect(descendantsOf('20')).not.toContain('40');
        expect(descendantsOf('20')).not.toContain('50');
    });

    it('yields nothing for a hidden start, a leaf and an unknown value', () => {
        expect(descendantsOf('40')).toEqual([]);
        expect(descendantsOf('60')).toEqual([]);
        expect(descendantsOf('999')).toEqual([]);
    });

    it('passes through a placeholder without a facet value', () => {
        const withPlaceholder = visibleSubtreeFacetValueIds([
            node(1, null, 10),
            node(2, 1, null),
            node(3, 2, 30),
        ]);
        expect(withPlaceholder('10')).toEqual(['30']);
    });

    it('does not loop on a parent cycle', () => {
        const cyclic = visibleSubtreeFacetValueIds([node(1, 2, 10), node(2, 1, 20)]);
        expect(cyclic('10')).toEqual(expect.arrayContaining(['20']));
        expect(cyclic('10').length).toBeLessThanOrEqual(2);
    });
});

describe('expandCategoryFilters', () => {
    const descendantsOf = visibleSubtreeFacetValueIds(rows);

    it('widens an or filter and keeps the original value first', () => {
        const [filter] = expandCategoryFilters([{ or: ['20'] }], descendantsOf) as Array<{
            or?: string[];
            and?: string;
        }>;
        expect(filter.or?.slice(0, 1)).toEqual(['20']);
        expect([...(filter.or ?? [])].sort()).toEqual(['20', '30', '60']);
    });

    it('turns an and filter into an or over the subtree', () => {
        const [filter] = expandCategoryFilters([{ and: '20' }], descendantsOf) as Array<{
            or?: string[];
            and?: string;
        }>;
        expect(filter.and).toBeUndefined();
        expect([...(filter.or ?? [])].sort()).toEqual(['20', '30', '60']);
    });

    it('leaves non-category, unknown and leaf values untouched', () => {
        const filters = [{ or: ['700', '60'] }, { and: '999' }];
        expect(expandCategoryFilters(filters, descendantsOf)).toEqual(filters);
    });

    it('does not duplicate ids that are already listed', () => {
        const [filter] = expandCategoryFilters([{ or: ['20', '30'] }], descendantsOf);
        expect([...(filter.or ?? [])].sort()).toEqual(['20', '30', '60']);
    });
});
