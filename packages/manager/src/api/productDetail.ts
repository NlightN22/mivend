import { adminApi } from './client';
import { fetchPriceEntriesForVariants } from './catalog';
import { fetchPriceTypeCodes } from './discounts';
import { FLOOR_PRICE_TYPE_CODE } from '../constants/pricing';

export interface ProductDetail {
    id: string;
    name: string;
    slug: string;
    facetValues: { id: string; name: string; facetCode: string }[];
    variants: { id: string; sku: string; stockOnHand: number }[];
}

export async function fetchProductBySlug(slug: string): Promise<ProductDetail | null> {
    const result = await adminApi<{
        product: {
            id: string;
            name: string;
            slug: string;
            facetValues: { id: string; name: string; facet: { code: string } }[];
            variants: { id: string; sku: string; stockLevels: { stockOnHand: number }[] }[];
        } | null;
    }>(
        `query ProductBySlug($slug: String) {
            product(slug: $slug) {
                id
                name
                slug
                facetValues { id name facet { code } }
                variants { id sku stockLevels { stockOnHand } }
            }
        }`,
        { slug },
    );
    if (!result.product) return null;
    return {
        id: result.product.id,
        name: result.product.name,
        slug: result.product.slug,
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
    const result = await adminApi<{
        productCrossReferences: CrossReferenceRow[];
    }>(
        `query ProductCrossReferences($productId: ID!) {
            productCrossReferences(productId: $productId) { oemCode oemBrand }
        }`,
        { productId },
    );
    return result.productCrossReferences;
}

export interface PriceRow {
    priceTypeCode: string;
    label: string;
    price: number | null;
}

// One row per known price type (Retail, Wholesale, ...) plus, if the caller has
// ReadFloorPrice, one for the confidential floor price — driven entirely by real
// data (priceTypeCodes), never a hardcoded business list (see AGENTS.md).
export async function fetchPricesForVariant(variantId: string): Promise<PriceRow[]> {
    const codes = await fetchPriceTypeCodes();
    const rows: PriceRow[] = [];
    for (const code of codes) {
        const map = await fetchPriceEntriesForVariants([variantId], code);
        rows.push({
            priceTypeCode: code,
            label: `${code[0]}${code.slice(1).toLowerCase()}`,
            price: map?.get(variantId) ?? null,
        });
    }
    const floorMap = await fetchPriceEntriesForVariants([variantId], FLOOR_PRICE_TYPE_CODE);
    if (floorMap) {
        rows.push({
            priceTypeCode: FLOOR_PRICE_TYPE_CODE,
            label: 'Floor price',
            price: floorMap.get(variantId) ?? null,
        });
    }
    return rows;
}
