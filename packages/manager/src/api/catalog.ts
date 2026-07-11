import { adminApi } from './client';

export interface CatalogFilters {
    search: string;
    categoryValueId: string;
    brandValueId: string;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
    search: '',
    categoryValueId: '',
    brandValueId: '',
};

export interface FacetValueOption {
    id: string;
    code: string;
    name: string;
}

export interface CatalogFacets {
    categories: FacetValueOption[];
    brands: FacetValueOption[];
}

// category/brand are both plain facets in this dataset (see seed-erp.mjs) — no dedicated
// Collection-based filter needed, matching the storefront's facet-driven approach.
export async function fetchCatalogFacets(): Promise<CatalogFacets> {
    const result = await adminApi<{
        facets: { items: { code: string; name: string; values: FacetValueOption[] }[] };
    }>(
        `query {
            facets(options: { take: 50 }) {
                items { code name values { id code name } }
            }
        }`,
    );
    const categoryFacet = result.facets.items.find(f => f.code === 'category');
    const brandFacet = result.facets.items.find(f => f.code === 'brand');
    return {
        categories: categoryFacet?.values ?? [],
        brands: brandFacet?.values ?? [],
    };
}

export interface CatalogListItem {
    productId: string;
    productVariantId: string;
    productName: string;
    sku: string;
    slug: string;
    facetValueIds: string[];
}

export interface CatalogPageResult {
    items: CatalogListItem[];
    totalItems: number;
}

function buildFacetValueFilters(filters: CatalogFilters): { or: string[] }[] {
    const groups: { or: string[] }[] = [];
    if (filters.categoryValueId) groups.push({ or: [filters.categoryValueId] });
    if (filters.brandValueId) groups.push({ or: [filters.brandValueId] });
    return groups;
}

export async function fetchCatalogPage(
    filters: CatalogFilters,
    page: number,
    pageSize: number,
): Promise<CatalogPageResult> {
    const result = await adminApi<{
        search: { totalItems: number; items: CatalogListItem[] };
    }>(
        `query($term: String, $facetValueFilters: [FacetValueFilterInput!], $skip: Int, $take: Int) {
            search(input: {
                term: $term
                facetValueFilters: $facetValueFilters
                groupByProduct: true
                skip: $skip
                take: $take
            }) {
                totalItems
                items { productId productVariantId productName sku slug facetValueIds }
            }
        }`,
        {
            term: filters.search || undefined,
            facetValueFilters: buildFacetValueFilters(filters),
            skip: (page - 1) * pageSize,
            take: pageSize,
        },
    );
    return { items: result.search.items, totalItems: result.search.totalItems };
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
