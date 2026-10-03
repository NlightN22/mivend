import { describe, it, expect } from 'vitest';

import {
    buildCategoryFacetFilter,
    collectFacetValueIds,
    parseFacetValueIds,
    planCategoryFilterUpdates,
    planCategoryVisibilityUpdates,
    resolveCategoryIsPrivate,
} from '../../categoryCollectionFilter';

const fvByCode = new Map([
    ['root-cat', 'fv-r'],
    ['mid', 'fv-m'],
    ['leaf', 'fv-l'],
]);
const node = (id: string, parentId: string | null, slug: string, ids: string[] = []) => ({
    id,
    parentId,
    slug,
    filterFacetValueIds: ids,
});

describe('planCategoryFilterUpdates', () => {
    it('gives every ancestor the facet values of its whole subtree', () => {
        const nodes = [
            node('0', null, '__root__'),
            node('1', '0', 'cat-root-cat', ['fv-r']),
            node('2', '1', 'cat-mid', ['fv-m']),
            node('3', '2', 'cat-leaf', ['fv-l']),
        ];
        expect(planCategoryFilterUpdates(nodes, fvByCode)).toEqual([
            { id: '1', facetValueIds: ['fv-l', 'fv-m', 'fv-r'] },
            { id: '2', facetValueIds: ['fv-l', 'fv-m'] },
        ]);
    });

    it('returns no update when filters already match (no unnecessary writes)', () => {
        const nodes = [
            node('1', '0', 'cat-root-cat', ['fv-m', 'fv-r']),
            node('2', '1', 'cat-mid', ['fv-m']),
        ];
        expect(planCategoryFilterUpdates(nodes, fvByCode)).toEqual([]);
    });

    it('skips a placeholder with no facet value and does not count its slug-less children', () => {
        const nodes = [node('1', '0', 'cat-unknown'), node('2', '1', 'cat-leaf', ['fv-l'])];
        expect(planCategoryFilterUpdates(nodes, fvByCode)).toEqual([]);
    });

    it('terminates on a cycle in the parent chain', () => {
        const nodes = [node('1', '2', 'cat-mid'), node('2', '1', 'cat-leaf')];
        expect(planCategoryFilterUpdates(nodes, fvByCode)).toHaveLength(2);
    });
});

describe('collectFacetValueIds / filter helpers', () => {
    it('dedupes and ignores descendants without a facet value', () => {
        expect(
            collectFacetValueIds('fv-r', ['cat-mid', 'cat-mid', 'cat-ghost', 'x'], fvByCode),
        ).toEqual(['fv-m', 'fv-r']);
    });

    it('round-trips ids through the stored filter shape', () => {
        const [op] = buildCategoryFacetFilter(['a', 'b']);
        expect(parseFacetValueIds([{ code: op.code, args: op.arguments }])).toEqual(['a', 'b']);
        expect(op.arguments).toContainEqual({ name: 'containsAny', value: 'true' });
    });

    it('returns [] for a missing or malformed filter', () => {
        expect(parseFacetValueIds([])).toEqual([]);
        expect(
            parseFacetValueIds([
                { code: 'facet-value-filter', args: [{ name: 'facetValueIds', value: '{' }] },
            ]),
        ).toEqual([]);
    });
});

const vis = (
    id: string,
    parentId: string | null,
    feedHidden: boolean,
    isPrivate: boolean,
    visibilityOverride: string | null = null,
) => ({ id, parentId, slug: `cat-${id}`, feedHidden, visibilityOverride, isPrivate });

describe('planCategoryVisibilityUpdates', () => {
    it('hides every descendant of a hidden category', () => {
        const nodes = [
            vis('a', null, true, true),
            vis('b', 'a', false, false),
            vis('c', 'b', false, false),
        ];
        expect(planCategoryVisibilityUpdates(nodes)).toEqual([
            { id: 'b', isPrivate: true },
            { id: 'c', isPrivate: true },
        ]);
    });

    it('unhides descendants when the parent is revived, but keeps feed-hidden ones hidden', () => {
        const nodes = [
            vis('a', null, false, false),
            vis('b', 'a', false, true),
            vis('c', 'a', true, true),
            vis('d', 'b', false, true),
        ];
        expect(planCategoryVisibilityUpdates(nodes)).toEqual([
            { id: 'b', isPrivate: false },
            { id: 'd', isPrivate: false },
        ]);
    });

    it('a manual override beats the ancestors, and its own children follow its state', () => {
        const nodes = [
            vis('a', null, true, true),
            vis('b', 'a', false, true, 'visible'),
            vis('c', 'b', false, true),
        ];
        expect(planCategoryVisibilityUpdates(nodes)).toEqual([
            { id: 'b', isPrivate: false },
            { id: 'c', isPrivate: false },
        ]);
    });

    it('hides an overridden empty leaf and its subtree, and clearing the override restores them', () => {
        const hidden = [
            vis('a', null, false, false),
            vis('b', 'a', false, false, 'hidden'),
            vis('c', 'b', false, false),
        ];
        expect(planCategoryVisibilityUpdates(hidden)).toEqual([
            { id: 'b', isPrivate: true },
            { id: 'c', isPrivate: true },
        ]);
        const cleared = [
            vis('a', null, false, false),
            vis('b', 'a', false, true),
            vis('c', 'b', false, true),
        ];
        expect(planCategoryVisibilityUpdates(cleared)).toEqual([
            { id: 'b', isPrivate: false },
            { id: 'c', isPrivate: false },
        ]);
    });

    it('a hidden override on a child does not hide its visible-override grandchild', () => {
        const nodes = [
            vis('a', null, false, false),
            vis('b', 'a', false, true, 'hidden'),
            vis('c', 'b', false, false, 'visible'),
        ];
        expect(planCategoryVisibilityUpdates(nodes)).toEqual([]);
    });

    it('makes no writes when everything is already consistent, and survives a cycle', () => {
        expect(planCategoryVisibilityUpdates([vis('a', null, false, false)])).toEqual([]);
        expect(() =>
            planCategoryVisibilityUpdates([
                vis('a', 'b', false, false),
                vis('b', 'a', false, false),
            ]),
        ).not.toThrow();
    });

    it('resolveCategoryIsPrivate: override first, then feed, then parent', () => {
        expect(resolveCategoryIsPrivate(false, 'hidden', false)).toBe(true);
        expect(resolveCategoryIsPrivate(true, 'visible', true)).toBe(false);
        expect(resolveCategoryIsPrivate(false, null, true)).toBe(true);
        expect(resolveCategoryIsPrivate(false, null, false)).toBe(false);
    });
});
