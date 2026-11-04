import { adminApi } from './client';
import { fetchFloorPricesForVariants, fetchPriceEntriesForVariants } from './catalog';
import { fetchPriceTypeCodes } from './discounts';
import { ProductBySlugDocument, ProductCrossReferencesDocument } from './generated/graphql';

export interface ProductDetail {
    id: string;
    name: string;
    slug: string;
    manufacturerName: string;
    facetValues: { id: string; name: string; facetCode: string }[];
    variants: { id: string; sku: string; stockOnHand: number }[];
}

export async function fetchProductBySlug(slug: string): Promise<ProductDetail | null> {
    const result = await adminApi(ProductBySlugDocument, { slug });
    if (!result.product) return null;
    return {
        id: result.product.id,
        name: result.product.name,
        slug: result.product.slug,
        manufacturerName: result.product.customFields?.manufacturer?.name ?? '',
        facetValues: result.product.facetValues.map(fv => ({
            id: fv.id,
            name: fv.name,
            facetCode: fv.facet.code,
        })),
        variants: result.product.variants.map(v => ({
            id: v.id,
            sku: v.sku,
            stockOnHand: v.stockLevels.reduce((sum, s) => sum + s.stockOnHand, 0),
        })),
    };
}

export interface CrossReferenceRow {
    oemCode: string;
    oemBrand: string;
}

export async function fetchCrossReferences(productId: string): Promise<CrossReferenceRow[]> {
    const result = await adminApi(ProductCrossReferencesDocument, { productId });
    return result.productCrossReferences;
}

export interface PriceRow {
    priceTypeCode: string;
    label: string;
    price: number | null;
}

// One row per price type from priceTypeCodes; never hardcode the list (see AGENTS.md).
// Floor price row is added only if the caller has ReadConfidentialPriceTypes (confidential).
export async function fetchPricesForVariant(variantId: string): Promise<PriceRow[]> {
    const codes = await fetchPriceTypeCodes();
    // The query takes one price type per request; per-code failures already resolve to null, so run them together.
    const [maps, floorMap] = await Promise.all([
        Promise.all(codes.map(code => fetchPriceEntriesForVariants([variantId], code))),
        fetchFloorPricesForVariants([variantId]),
    ]);
    const rows: PriceRow[] = codes.map((code, i) => ({
        priceTypeCode: code,
        label: `${code[0]}${code.slice(1).toLowerCase()}`,
        price: maps[i]?.get(variantId) ?? null,
    }));
    if (floorMap) {
        rows.push({
            priceTypeCode: 'floor',
            label: 'Floor price',
            price: floorMap.get(variantId) ?? null,
        });
    }
    return rows;
}
