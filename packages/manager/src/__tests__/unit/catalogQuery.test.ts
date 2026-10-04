import { describe, it, expect } from 'vitest';
import {
    parseCatalogQuery,
    buildCatalogQuery,
    withCategoryFacet,
} from '../../composables/catalogQuery';

// Test plan: pure query<->state mapping for the catalog URL sync (manager-portal-rules #1).
// Invariants: round trip is lossless; defaults are omitted; unrelated keys survive; the
// collection slug maps to its same-coded category facet value. Tree/panel logic is covered by
// packages/shared's collectionTree tests. Unit level only; no transport involved.
const groups = [{ code: 'category', values: [{ id: '7', code: 'cat-engine-oils' }] }];

describe('catalogQuery', () => {
    it('parses an empty query to defaults', () => {
        expect(parseCatalogQuery({})).toEqual({
            collection: undefined,
            facetValueIds: [],
            inStock: false,
            priceMin: null,
            priceMax: null,
            page: 1,
        });
    });

    it('round-trips every field and ignores a bad page', () => {
        const state = {
            collection: 'cat-cat-engine-oils',
            facetValueIds: ['1', '2'],
            inStock: true,
            priceMin: 5,
            priceMax: 9,
            page: 3,
        };
        const query = buildCatalogQuery({ other: 'x' }, state);
        expect(query.other).toBe('x');
        expect(parseCatalogQuery(query as Record<string, string>)).toEqual(state);
        expect(parseCatalogQuery({ page: 'abc' }).page).toBe(1);
    });

    it('omits defaults from the built query', () => {
        const q = buildCatalogQuery({}, parseCatalogQuery({}));
        expect(Object.values(q).every(v => v === undefined)).toBe(true);
    });

    it('adds the category facet value for a known collection only', () => {
        expect(withCategoryFacet(['1'], 'cat-cat-engine-oils', groups)).toEqual(['1', '7']);
        expect(withCategoryFacet(['1'], 'unknown', groups)).toEqual(['1']);
        expect(withCategoryFacet(['1'], undefined, groups)).toEqual(['1']);
    });
});
