import { describe, it, expect } from 'vitest';
import { buildSearchLocation, resolveScopeLabel } from '../../composables/searchScope';

const tree = [
    {
        id: '1',
        name: 'Oils',
        slug: 'oils',
        children: [{ id: '2', name: 'Engine oil', slug: 'engine-oil', children: [] }],
    },
];

describe('buildSearchLocation', () => {
    it('keeps the selected category and drops other filters', () => {
        expect(buildSearchLocation('zic', 'oils')).toEqual({
            path: '/catalog',
            query: { q: 'zic', collection: 'oils' },
        });
    });

    it('omits the category when none is selected', () => {
        expect(buildSearchLocation('zic', undefined).query).toEqual({ q: 'zic' });
    });

    it('omits an empty term but keeps the category', () => {
        expect(buildSearchLocation('', 'oils').query).toEqual({ collection: 'oils' });
    });
});

describe('resolveScopeLabel', () => {
    it('resolves a nested category name by slug', () => {
        expect(resolveScopeLabel(tree as never, 'engine-oil')).toBe('Engine oil');
    });

    it('returns undefined for an unknown or missing slug', () => {
        expect(resolveScopeLabel(tree as never, 'nope')).toBeUndefined();
        expect(resolveScopeLabel(tree as never, undefined)).toBeUndefined();
    });
});
