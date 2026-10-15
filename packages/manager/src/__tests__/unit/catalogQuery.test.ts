import { describe, it, expect } from 'vitest';
import { parseCatalogQuery, buildCatalogQuery } from '../../composables/catalogQuery';

// Unit only. Query<->state mapping: lossless round trip, defaults omitted, unrelated keys preserved.
// Tree/panel logic is covered by collectionTree tests in packages/shared; don't duplicate it here.
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
});
