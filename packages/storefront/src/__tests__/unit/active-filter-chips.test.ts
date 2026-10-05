import { describe, it, expect } from 'vitest';
import {
    buildActiveFilterChips,
    removeFilterChip,
    clearRefinementFilters,
} from '../../composables/useActiveFilterChips';
import type { FilterState } from '../../composables/useProductList';

const labels = {
    inStock: 'In stock only',
    price: (min: number | null, max: number | null) => `Price: ${min ?? ''} – ${max ?? ''}`,
};
const groups = [
    {
        code: 'category',
        name: 'Category',
        values: [{ id: 'c1', code: 'c1', name: 'Cat', count: 1 }],
    },
    {
        code: 'manufacturer',
        name: 'Manufacturer',
        values: [
            { id: 'b1', code: 'b1', name: 'Brand 1', count: 3 },
            { id: 'b2', code: 'b2', name: 'Brand 2', count: 2 },
        ],
    },
];
const empty: FilterState = { facetValueIds: [], inStock: false, priceMin: null, priceMax: null };

describe('buildActiveFilterChips', () => {
    it('returns nothing when no filter is active', () => {
        expect(buildActiveFilterChips(empty, groups, labels)).toEqual([]);
    });

    it('builds one chip per active value and skips the category facet', () => {
        const chips = buildActiveFilterChips(
            { facetValueIds: ['c1', 'b2'], inStock: true, priceMin: 15, priceMax: 20 },
            groups,
            labels,
        );
        expect(chips).toEqual([
            { key: 'fv:b2', label: 'Manufacturer: Brand 2' },
            { key: 'price', label: 'Price: 15 – 20' },
            { key: 'inStock', label: 'In stock only' },
        ]);
    });

    it('shows an open-ended price range', () => {
        const [chip] = buildActiveFilterChips({ ...empty, priceMin: 5 }, groups, labels);
        expect(chip.label).toBe('Price: 5 – ');
    });
});

describe('removeFilterChip', () => {
    const full: FilterState = {
        facetValueIds: ['c1', 'b1', 'b2'],
        inStock: true,
        priceMin: 1,
        priceMax: 2,
    };

    it('removes only the matching facet value', () => {
        expect(removeFilterChip(full, 'fv:b1').facetValueIds).toEqual(['c1', 'b2']);
    });

    it('clears both price bounds', () => {
        expect(removeFilterChip(full, 'price')).toMatchObject({
            priceMin: null,
            priceMax: null,
            inStock: true,
        });
    });

    it('clears in-stock', () => {
        expect(removeFilterChip(full, 'inStock').inStock).toBe(false);
    });
});

describe('clearRefinementFilters', () => {
    it('resets refinements but keeps the selected category', () => {
        const result = clearRefinementFilters(
            { facetValueIds: ['c1', 'b1'], inStock: true, priceMin: 1, priceMax: 2 },
            groups,
        );
        expect(result).toEqual({
            facetValueIds: ['c1'],
            inStock: false,
            priceMin: null,
            priceMax: null,
        });
    });
});

describe('before facets are available', () => {
    const active: FilterState = {
        facetValueIds: ['c1', 'b1'],
        inStock: true,
        priceMin: 1,
        priceMax: 2,
    };

    it('clear-all never drops the category when facet groups are empty', () => {
        expect(clearRefinementFilters(active, []).facetValueIds).toEqual(['c1', 'b1']);
    });

    it('builds only the non-facet chips', () => {
        expect(buildActiveFilterChips(active, [], labels).map(c => c.key)).toEqual([
            'price',
            'inStock',
        ]);
    });
});
