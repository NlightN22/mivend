import { describe, it, expect } from 'vitest';

import {
    buildCategoryFacetFilter,
    collectFacetValueIds,
    parseFacetValueIds,
    planCategoryFilterUpdates,
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
