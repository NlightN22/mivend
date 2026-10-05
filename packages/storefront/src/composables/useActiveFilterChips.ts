import { computed, type Ref } from 'vue';
import type { ActiveFilter } from '@mivend/ui-kit';
import type { FacetGroup } from '../../../shared/src/catalogFacets';
import type { FilterState } from './useProductList';

export interface ChipLabels {
    inStock: string;
    price: (min: number | null, max: number | null) => string;
}

export function buildActiveFilterChips(
    filters: FilterState,
    facetGroups: FacetGroup[],
    labels: ChipLabels,
    hiddenFacetCodes: string[] = ['category'],
): ActiveFilter[] {
    const chips: ActiveFilter[] = [];
    const selected = new Set(filters.facetValueIds);
    for (const group of facetGroups) {
        if (hiddenFacetCodes.includes(group.code)) continue;
        for (const value of group.values) {
            if (selected.has(value.id)) {
                chips.push({ key: `fv:${value.id}`, label: `${group.name}: ${value.name}` });
            }
        }
    }
    if (filters.priceMin != null || filters.priceMax != null) {
        chips.push({ key: 'price', label: labels.price(filters.priceMin, filters.priceMax) });
    }
    if (filters.inStock) chips.push({ key: 'inStock', label: labels.inStock });
    return chips;
}

export function removeFilterChip(filters: FilterState, key: string): FilterState {
    if (key === 'inStock') return { ...filters, inStock: false };
    if (key === 'price') return { ...filters, priceMin: null, priceMax: null };
    if (key.startsWith('fv:')) {
        const id = key.slice(3);
        return { ...filters, facetValueIds: filters.facetValueIds.filter(v => v !== id) };
    }
    return filters;
}

export function clearRefinementFilters(
    filters: FilterState,
    facetGroups: FacetGroup[],
    hiddenFacetCodes: string[] = ['category'],
): FilterState {
    const kept = new Set(
        facetGroups
            .filter(g => hiddenFacetCodes.includes(g.code))
            .flatMap(g => g.values.map(v => v.id)),
    );
    return {
        facetValueIds: filters.facetValueIds.filter(id => kept.has(id)),
        inStock: false,
        priceMin: null,
        priceMax: null,
    };
}

export function useActiveFilterChips(
    filters: Ref<FilterState>,
    facetGroups: Ref<FacetGroup[]>,
    labels: ChipLabels,
) {
    const chips = computed(() => buildActiveFilterChips(filters.value, facetGroups.value, labels));
    function remove(key: string): void {
        filters.value = removeFilterChip(filters.value, key);
    }
    function clear(): void {
        filters.value = clearRefinementFilters(filters.value, facetGroups.value);
    }
    return { chips, remove, clear };
}
