import { adminApi } from './client';
// Imports the TS source directly — see the comment in storefront's useProductList.ts for why
// 'shared''s compiled package output breaks a Vite production build.
import {
    buildFacetValueFilters,
    buildFacetGroups,
    type FacetGroup,
    type EsFacetValueResult,
} from '../../../shared/src/catalogFacets';

export interface CatalogFilters {
    search: string;
    facetValueIds: string[];
    inStock: boolean;
    priceMin: number | null;
    priceMax: number | null;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
    search: '',
    facetValueIds: [],
    inStock: false,
    priceMin: null,
    priceMax: null,
};

// Facets query — no facetValueFilters, so the panel always shows every available value
// regardless of the current selection (mirrors storefront's FACETS_QUERY).
export async function fetchCatalogFacets(term: string): Promise<FacetGroup[]> {
    const result = await adminApi<{
        search: { facetValues: EsFacetValueResult[] };
    }>(
        `query($term: String) {
            search(input: { term: $term, take: 0, skip: 0, groupByProduct: true }) {
                facetValues {
                    facetValue { id code name facet { code name } }
                    count
                }
            }
        }`,
        { term: term || undefined },
    );
    return buildFacetGroups(result.search.facetValues);
}

export interface CatalogListItem {
    productId: string;
    productVariantId: string;
    productName: string;
    sku: string;
    slug: string;
    facetValueIds: string[];
    imagePreview: string | null;
}

export interface CatalogPageResult {
    items: CatalogListItem[];
    totalItems: number;
}

function buildPriceRange(filters: CatalogFilters): { min: number; max: number } | undefined {
    if (filters.priceMin == null && filters.priceMax == null) return undefined;
    return {
        min: filters.priceMin != null ? Math.round(filters.priceMin * 100) : 0,
        max: filters.priceMax != null ? Math.round(filters.priceMax * 100) : 999_999_999,
    };
}

export async function fetchCatalogPage(
    filters: CatalogFilters,
    facetGroups: FacetGroup[],
    page: number,
    pageSize: number,
): Promise<CatalogPageResult> {
    const result = await adminApi<{
        search: {
            totalItems: number;
            items: (Omit<CatalogListItem, 'imagePreview'> & {
                productAsset: { preview: string } | null;
            })[];
        };
    }>(
        `query($term: String, $facetValueFilters: [FacetValueFilterInput!], $inStock: Boolean, $priceRangeWithTax: PriceRangeInput, $skip: Int, $take: Int) {
            search(input: {
                term: $term
                facetValueFilters: $facetValueFilters
                inStock: $inStock
                priceRangeWithTax: $priceRangeWithTax
                groupByProduct: true
                skip: $skip
                take: $take
            }) {
                totalItems
                items {
                    productId
                    productVariantId
                    productName
                    sku
                    slug
                    facetValueIds
                    productAsset { preview }
                }
            }
        }`,
        {
            term: filters.search || undefined,
            facetValueFilters: buildFacetValueFilters(filters.facetValueIds, facetGroups),
            inStock: filters.inStock ? true : undefined,
            priceRangeWithTax: buildPriceRange(filters),
            skip: (page - 1) * pageSize,
            take: pageSize,
        },
    );
    return {
        items: result.search.items.map(item => ({
            ...item,
            imagePreview: item.productAsset?.preview ?? null,
        })),
        totalItems: result.search.totalItems,
    };
}

export interface VariantStock {
    variantId: string;
    stockOnHand: number;
}

export async function fetchStockForVariants(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const result = await adminApi<{
        productVariants: { items: { id: string; stockLevels: { stockOnHand: number }[] }[] };
    }>(
        `query($ids: [String!]!) {
            productVariants(options: { filter: { id: { in: $ids } } }) {
                items { id stockLevels { stockOnHand } }
            }
        }`,
        { ids: variantIds },
    );
    return new Map(
        result.productVariants.items.map(v => [
            v.id,
            v.stockLevels.reduce((sum, s) => sum + s.stockOnHand, 0),
        ]),
    );
}

// Returns null (rather than an empty map) when the caller lacks permission for this
// priceTypeCode (e.g. FLOOR for a Manager/Operator) — see PriceEntryAdminResolver
// .priceEntriesForVariants — so callers can distinguish "no prices set" from "not allowed".
export async function fetchPriceEntriesForVariants(
    variantIds: string[],
    priceTypeCode: string,
): Promise<Map<string, number> | null> {
    if (variantIds.length === 0) return new Map();
    try {
        const result = await adminApi<{
            priceEntriesForVariants: { variantId: string; price: number }[];
        }>(
            `query($ids: [ID!]!, $priceTypeCode: String!) {
                priceEntriesForVariants(variantIds: $ids, priceTypeCode: $priceTypeCode) {
                    variantId
                    price
                }
            }`,
            { ids: variantIds, priceTypeCode },
        );
        return new Map(result.priceEntriesForVariants.map(e => [e.variantId, e.price]));
    } catch {
        return null;
    }
}
