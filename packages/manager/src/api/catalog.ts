import { adminApi } from './client';
// Imports the TS source directly — see the comment in storefront's useProductList.ts for why
// 'shared''s compiled package output breaks a Vite production build.
import {
    buildFacetValueFilters,
    buildFacetGroups,
    type FacetGroup,
} from '../../../shared/src/catalogFacets';
import {
    buildCategoryTree,
    fetchAllCollections,
    type CollectionNode,
} from '../../../shared/src/collectionTree';
import {
    CatalogFacetsDocument,
    CatalogPageDocument,
    CatalogPriceEntriesForVariantsDocument,
    CatalogVariantStockDocument,
    CategoryTreeDocument,
} from './generated/graphql';

export interface CatalogFilters {
    search: string;
    facetValueIds: string[];
    // mivend#86: kept on the filter shape for UI/state-shape compatibility, but NOT actually
    // sent to the search query below — Admin API's own SearchInput type has no `inStock`/
    // `priceRangeWithTax` field at all (confirmed live: the pre-migration raw query string sent
    // both unconditionally and every single fetchCatalogPage() call was failing GraphQL
    // validation — "Field 'inStock' is not defined by type 'SearchInput'" /
    // "Unknown type 'PriceRangeInput'" — the whole Catalog page was broken before this fix, not
    // just these two filters). Restoring real stock/price-range filtering needs its own design
    // (Admin API's search genuinely has no such field; Shop API's does) — left in the filter
    // shape so the UI controls keep compiling, but they are currently inert. Follow-up issue
    // needed before re-wiring them.
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
    const result = await adminApi(CatalogFacetsDocument, { term: term || undefined });
    return buildFacetGroups(result.search.facetValues);
}

// Full Collection tree for the catalog category dropdown, built by the same shared helper the
// storefront mega-menu uses.
export async function fetchCategoryTree(): Promise<CollectionNode[]> {
    const items = await fetchAllCollections(async (skip, take) => {
        const result = await adminApi(CategoryTreeDocument, { skip, take });
        return result.collections;
    });
    return buildCategoryTree(items);
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

export async function fetchCatalogPage(
    filters: CatalogFilters,
    facetGroups: FacetGroup[],
    page: number,
    pageSize: number,
    collectionSlug?: string,
): Promise<CatalogPageResult> {
    const result = await adminApi(CatalogPageDocument, {
        term: filters.search || undefined,
        collectionSlug,
        facetValueFilters: buildFacetValueFilters(filters.facetValueIds, facetGroups),
        skip: (page - 1) * pageSize,
        take: pageSize,
    });
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
    const result = await adminApi(CatalogVariantStockDocument, { ids: variantIds });
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
        const result = await adminApi(CatalogPriceEntriesForVariantsDocument, {
            ids: variantIds,
            priceTypeCode,
        });
        return new Map(result.priceEntriesForVariants.map(e => [e.variantId, e.price]));
    } catch {
        return null;
    }
}
