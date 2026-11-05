import { CATEGORY_FACET_CODE, CATEGORY_SLUG_PREFIX } from './categoryCollectionFilter';

// Matches by collection slug because membership rows can lag; `isPrivate` already carries
// inheritance down the tree and the manual override (see docs/access-control.md).
export const HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL = `SELECT fv.id FROM facet_value fv
    JOIN facet f ON f.id = fv."facetId" AND f.code = '${CATEGORY_FACET_CODE}'
    JOIN collection_translation ct ON ct.slug = '${CATEGORY_SLUG_PREFIX}' || fv.code
    JOIN collection col ON col.id = ct."baseId" AND col."isPrivate" = true`;

// The category FacetValue sits on the product (local import) or on its variant (ERP feed).
export function productInHiddenCategorySql(productIdColumn = 'product.id'): string {
    return `(EXISTS (
    SELECT 1 FROM product_facet_values_facet_value pf
    WHERE pf."productId" = ${productIdColumn} AND pf."facetValueId" IN (${HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL})
) OR EXISTS (
    SELECT 1 FROM product_variant hv
    JOIN product_variant_facet_values_facet_value hvf ON hvf."productVariantId" = hv.id
    WHERE hv."productId" = ${productIdColumn} AND hv."deletedAt" IS NULL
    AND hvf."facetValueId" IN (${HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL})
))`;
}

export function productNotInHiddenCategorySql(productIdColumn = 'product.id'): string {
    return `NOT ${productInHiddenCategorySql(productIdColumn)}`;
}

export const MAX_EXCLUDE_CATEGORY_IDS = 1000;
const MAX_EXCLUDE_CATEGORY_ID_LENGTH = 100;

export interface HiddenCategoryRow {
    id: number | string;
    parentId: number | string | null;
    slug: string;
}

// search-service rolls an excluded id up to its subtree and caps the list; past the cap only
// hidden nodes with a visible parent are sent.
export function excludeCategoryIdsFor(
    rows: HiddenCategoryRow[],
    limit = MAX_EXCLUDE_CATEGORY_IDS,
): string[] {
    const own = rows.filter(r => r.slug.startsWith(CATEGORY_SLUG_PREFIX));
    const hiddenIds = new Set(own.map(r => String(r.id)));
    const chosen =
        own.length <= limit
            ? own
            : own.filter(r => r.parentId === null || !hiddenIds.has(String(r.parentId)));
    const ids = chosen
        .map(r => r.slug.slice(CATEGORY_SLUG_PREFIX.length))
        .filter(id => id.length > 0 && id.length <= MAX_EXCLUDE_CATEGORY_ID_LENGTH);
    return [...new Set(ids)].sort();
}
