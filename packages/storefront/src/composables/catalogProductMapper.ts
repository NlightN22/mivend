import { assetUrl } from './assetUrl';
import type { CatalogProductsQuery } from '../api/generated/graphql';
import type { FacetValue, EsFacetValueResult } from '../../../shared/src/catalogFacets';

export interface DiscountTierVM {
    percent: number;
    minWeightKg: number | null;
    minAmount: number | null;
}

interface ProductVariant {
    id: string;
    sku: string;
    // Undefined, not 0: a 0 would make an unresolved price look like a genuinely free product.
    // A real 'no price' state only occurs before bootstrap or on misconfiguration.
    price: number | undefined;
    customerPrice: number | null;
    compareAtPrice: number | null;
    discountTiers: DiscountTierVM[];
    currencyCode: string;
    stockLevel: string;
    unitName: string | null;
    unitRatioToBase: number | null;
    multiplicity?: number | null;
    packagingLevels?: { name: string; ratioToBase: number }[];
}

export interface ProductItem {
    id: string;
    name: string;
    slug: string;
    variants: ProductVariant[];
    facetValues: FacetValue[];
    manufacturer?: { name?: string | null } | null;
    images: string[];
    codeMatch?: CodeMatchKind;
}

// Mirrors CODE_GROUP_LIMIT of the search plugin: hits asked per code group on the first page.
const CODE_GROUP_LIMIT = 24;

export type CodeMatchKind =
    | 'sku'
    | 'partNumber'
    | 'manufacturerCode'
    | 'cross'
    | 'weakCross'
    | 'prefix';

type EsSearchItem = CatalogProductsQuery['search']['items'][number];

interface CodeGroup {
    total: number;
    items: EsSearchItem[];
}

// Code groups come first in priority order, then full-text; the server keeps them disjoint.
export function mapCodeGroups(
    search: CatalogProductsQuery['search'],
    facetValues: EsFacetValueResult[],
): { items: ProductItem[]; total: number; truncated: boolean } {
    const groups: Array<[CodeMatchKind, CodeGroup | null | undefined]> = [
        ['sku', search.skuMatches],
        ['partNumber', search.partNumberMatches],
        ['manufacturerCode', search.manufacturerCodeMatches],
        ['cross', search.crossMatches],
        ['prefix', search.prefixMatches],
    ];
    const items: ProductItem[] = [];
    let total = 0;
    let truncated = false;
    for (const [codeMatch, group] of groups) {
        if (!group) continue;
        total += group.total;
        truncated ||= group.total > CODE_GROUP_LIMIT;
        const mapped = mapItems(group.items, facetValues);
        items.push(
            ...mapped.map((item, i) => ({
                ...item,
                codeMatch: weakCrossOf(codeMatch, group.items[i]),
            })),
        );
    }
    return { items, total, truncated };
}

// A weak cross is shown as a possible analogue; the part it crosses with is never exposed.
function weakCrossOf(kind: CodeMatchKind, source: EsSearchItem | undefined): CodeMatchKind {
    return kind === 'cross' && source?.matchReasons?.includes('weakCross') ? 'weakCross' : kind;
}

export function mapItems(items: EsSearchItem[], facetValues: EsFacetValueResult[]): ProductItem[] {
    const facetMap = new Map<string, FacetValue>();
    for (const { facetValue } of facetValues) {
        facetMap.set(facetValue.id, facetValue);
    }
    return items.map(item => ({
        id: item.productId,
        name: item.productName,
        slug: item.slug,
        manufacturer: item.manufacturer,
        images: item.galleryPreviews.map(preview => assetUrl(preview, 'small')),
        variants: [
            {
                id: item.productVariantId,
                sku: item.sku,
                // Never use priceWithTax: a placeholder under SEARCH_BACKEND=external, and customer-agnostic.
                // Only customerPrice is valid: the resolver always supplies it, with the branch fallback.
                price: item.customerPrice ?? undefined,
                customerPrice: item.customerPrice ?? null,
                compareAtPrice: item.compareAtPrice ?? null,
                discountTiers: item.discountTiers.map(tier => ({
                    percent: tier.percent,
                    minWeightKg: tier.minWeightKg ?? null,
                    minAmount: tier.minAmount ?? null,
                })),
                currencyCode: item.currencyCode,
                stockLevel: item.stockLevel,
                unitName: item.unitName ?? null,
                unitRatioToBase: item.unitRatioToBase ?? null,
                multiplicity: item.multiplicity ?? null,
                packagingLevels: item.packagingLevels,
            },
        ],
        facetValues: item.facetValueIds.flatMap(id => {
            const fv = facetMap.get(id);
            return fv ? [fv] : [];
        }),
    }));
}
