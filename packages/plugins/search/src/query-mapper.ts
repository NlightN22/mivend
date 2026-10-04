import type { ResolvedSearchFilters } from './search-filter-resolver.service';
import type { ShopSearchInput } from './types';

export type SearchServiceSort = 'relevance' | 'name' | 'nameDesc' | 'priceAsc' | 'priceDesc';

export interface ResolveQueryRequest {
    query: string;
    categoryId?: string;
    filters?: {
        manufacturer?: string[];
        warehouseIds?: string[];
        priceRange?: { min?: number; max?: number };
    };
    sort?: SearchServiceSort;
    limit?: number;
    offset?: number;
    availableOnly?: boolean;
}

export function hasBrowseCriteria(request: ResolveQueryRequest): boolean {
    return Boolean(
        request.query ||
        request.categoryId ||
        request.filters?.manufacturer?.length ||
        request.filters?.priceRange,
    );
}

function mapSort(input: ShopSearchInput): SearchServiceSort {
    if (input.sort?.price) return input.sort.price === 'DESC' ? 'priceDesc' : 'priceAsc';
    if (input.sort?.name) return input.sort.name === 'DESC' ? 'nameDesc' : 'name';
    return 'relevance';
}

// The storefront sends minor units (Int); search-service indexes the price in major units.
function mapPriceRange(input: ShopSearchInput): { min?: number; max?: number } | undefined {
    const range = input.priceRangeWithTax;
    if (!range) return undefined;
    return { min: range.min / 100, max: range.max / 100 };
}

export function mapSearchInputToResolveQueryRequest(
    input: ShopSearchInput,
    resolved: ResolvedSearchFilters,
): ResolveQueryRequest {
    const priceRange = mapPriceRange(input);
    const filters = {
        ...(priceRange ? { priceRange } : {}),
        ...(resolved.manufacturer.length > 0 ? { manufacturer: resolved.manufacturer } : {}),
        ...(resolved.warehouseIds ? { warehouseIds: resolved.warehouseIds } : {}),
    };
    return {
        query: input.term ?? '',
        ...(resolved.categoryId ? { categoryId: resolved.categoryId } : {}),
        ...(Object.keys(filters).length > 0 ? { filters } : {}),
        ...(input.inStock ? { availableOnly: true } : {}),
        sort: mapSort(input),
        limit: input.take ?? undefined,
        offset: input.skip ?? undefined,
    };
}
