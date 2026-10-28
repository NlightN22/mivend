import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, evaluateProductTerms, loadFilterTerms } from 'shared';
import type { FilterTerm, ProductAttributes, RefResolution } from 'shared';

const FILTER_TERMS = { table: 'discount_setup_filter_term', ownerColumn: 'setupId' };

export function loadSetupTerms(
    connection: TransactionalConnection,
    ctx: RequestContext,
    setupIds: number[],
): Promise<Map<number, FilterTerm[]>> {
    return loadFilterTerms(connection, ctx, FILTER_TERMS, setupIds);
}

// Which refs used by the terms exist in mivend; the category slug is 'cat-' || ERP id.
export async function resolveRefs(
    connection: TransactionalConnection,
    ctx: RequestContext,
    refs: string[],
): Promise<RefResolution> {
    const manufacturers = new Set<string>();
    const categories = new Set<string>();
    const products = new Set<string>();
    if (refs.length === 0) return { manufacturers, categories, products };
    const rows = await ctxQuery<
        Array<{ ref: string; manufacturer: boolean; category: boolean; product: boolean }>
    >(
        connection,
        ctx,
        `SELECT r.ref,
                EXISTS (SELECT 1 FROM manufacturer m WHERE m."externalId" = r.ref) AS manufacturer,
                EXISTS (SELECT 1 FROM collection_translation ct WHERE ct.slug = 'cat-' || r.ref) AS category,
                EXISTS (SELECT 1 FROM product p WHERE p."customFieldsExternalid" = r.ref) AS product
         FROM unnest($1::text[]) AS r(ref)`,
        [refs],
    );
    for (const row of rows) {
        if (row.manufacturer) manufacturers.add(row.ref);
        if (row.category) categories.add(row.ref);
        if (row.product) products.add(row.ref);
    }
    return { manufacturers, categories, products };
}

// One query for the whole batch. Category refs are the product's category and all its ancestors;
// a product without a category facet value (unresolved category) gets none.
export async function loadProductAttributes(
    connection: TransactionalConnection,
    ctx: RequestContext,
    productErpIds: string[],
): Promise<Map<string, ProductAttributes>> {
    const attributes = new Map<string, ProductAttributes>();
    if (productErpIds.length === 0) return attributes;
    const rows = await ctxQuery<
        Array<{ productRef: string; manufacturerRef: string | null; categoryRefs: string[] }>
    >(
        connection,
        ctx,
        `SELECT p."customFieldsExternalid" AS "productRef", m."externalId" AS "manufacturerRef",
                COALESCE((
                    SELECT array_agg(DISTINCT substr(anc.slug, 5))
                    FROM (SELECT pvf."facetValueId" FROM product_variant pv
                          JOIN product_variant_facet_values_facet_value pvf ON pvf."productVariantId" = pv.id
                          WHERE pv."productId" = p.id AND pv."deletedAt" IS NULL
                          UNION
                          SELECT pf."facetValueId" FROM product_facet_values_facet_value pf
                          WHERE pf."productId" = p.id) own
                    JOIN facet_value fv ON fv.id = own."facetValueId"
                    JOIN facet f ON f.id = fv."facetId" AND f.code = 'category'
                    JOIN collection_translation leaf ON leaf.slug = 'cat-' || fv.code
                    JOIN collection_closure cc ON cc.id_descendant = leaf."baseId"
                    JOIN collection_translation anc ON anc."baseId" = cc.id_ancestor AND anc.slug LIKE 'cat-%'
                ), '{}') AS "categoryRefs"
         FROM product p
         LEFT JOIN manufacturer m ON m.id = p."customFieldsManufacturerid"
         WHERE p."customFieldsExternalid" = ANY($1::text[])`,
        [productErpIds],
    );
    for (const row of rows) {
        attributes.set(row.productRef, {
            productRef: row.productRef,
            manufacturerRef: row.manufacturerRef,
            categoryRefs: new Set(row.categoryRefs),
        });
    }
    return attributes;
}

// Per filter setup, which of the products in play satisfy all its terms. A product without a
// loaded row (unknown to mivend) matches nothing.
export function filterMembers(
    termsBySetup: Map<number, FilterTerm[]>,
    attributes: Map<string, ProductAttributes>,
    known: RefResolution,
    productErpIds: string[],
): Map<number, Set<string>> {
    const members = new Map<number, Set<string>>();
    for (const [setupId, terms] of termsBySetup) {
        const matched = new Set<string>();
        for (const id of productErpIds) {
            const attrs = attributes.get(id);
            if (attrs && evaluateProductTerms(terms, attrs, known)) matched.add(id);
        }
        members.set(setupId, matched);
    }
    return members;
}
