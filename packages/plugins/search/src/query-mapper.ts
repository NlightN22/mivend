import type { ResolvedSearchFilters } from './search-filter-resolver.service';
import type { ShopSearchInput } from './types';

export type SearchServiceSort = 'relevance' | 'name' | 'nameDesc' | 'priceAsc' | 'priceDesc';

// Mirrors mivend's availability formula minus allocations, which search cannot know (docs/order-flow.md).
export const AVAILABILITY_MODE = 'onHandAndErp';

export interface ResolveQueryRequest {
    query: string;
    priceTypeId?: string;
    categoryId?: string;
    filters?: {
        manufacturer?: string[];
        warehouseIds?: string[];
        characteristics?: Array<{ key: string; normalized: string }>;
        priceRange?: { min?: number; max?: number };
    };
    sort?: SearchServiceSort;
    limit?: number;
    offset?: number;
    skuLimit?: number;
    partNumberLimit?: number;
    manufacturerCodeLimit?: number;
    availableOnly?: boolean;
    availabilityMode?: typeof AVAILABILITY_MODE;
    requireOrganization?: boolean;
    excludeCategoryIds?: string[];
}

// Code groups load once on the first page; later pages and facets-only requests ask for none so a
// product never repeats. Larger groups mean a too-broad query: the UI asks to refine it (#307).
export const CODE_GROUP_LIMIT = 24;

export function hasPriceCriteria(input: ShopSearchInput): boolean {
    return Boolean(input.priceRangeWithTax || input.sort?.price);
}

export function hasBrowseCriteria(request: ResolveQueryRequest): boolean {
    return Boolean(
        request.query ||
        request.categoryId ||
        request.filters?.manufacturer?.length ||
        request.filters?.characteristics?.length ||
        request.filters?.priceRange ||
        request.sort === 'priceAsc' ||
        request.sort === 'priceDesc',
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
    priceTypeId?: string | null,
): ResolveQueryRequest {
    const priceRange = mapPriceRange(input);
    const filters = {
        ...(priceRange ? { priceRange } : {}),
        ...(resolved.manufacturer.length > 0 ? { manufacturer: resolved.manufacturer } : {}),
        ...(resolved.characteristics.length > 0
            ? { characteristics: resolved.characteristics }
            : {}),
        ...(resolved.warehouseIds ? { warehouseIds: resolved.warehouseIds } : {}),
    };
    const groupLimit = input.take === 0 || (input.skip ?? 0) > 0 ? 0 : CODE_GROUP_LIMIT;
    return {
        query: input.term ?? '',
        ...(input.term
            ? {
                  skuLimit: groupLimit,
                  partNumberLimit: groupLimit,
                  manufacturerCodeLimit: groupLimit,
              }
            : {}),
        ...(priceTypeId ? { priceTypeId } : {}),
        ...(resolved.categoryId ? { categoryId: resolved.categoryId } : {}),
        ...(Object.keys(filters).length > 0 ? { filters } : {}),
        availableOnly: Boolean(input.inStock),
        availabilityMode: AVAILABILITY_MODE,
        sort: mapSort(input),
        // search-service rejects limit 0; a facets-only request (take 0) still needs one hit.
        limit:
            input.take === undefined || input.take === null ? undefined : Math.max(input.take, 1),
        offset: input.skip ?? undefined,
    };
}
