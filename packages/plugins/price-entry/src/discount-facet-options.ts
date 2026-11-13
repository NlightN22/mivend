import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQueryBounded } from 'shared';

export interface DiscountFacetOption {
    code: string;
    name: string;
    values: { code: string; name: string }[];
}

export interface FacetOptionRow {
    facetCode: string;
    facetName: string | null;
    valueCode: string | null;
    valueName: string | null;
}

// DISTINCT ON keeps one translation per facet/value: the request language wins over the default one.
const FACET_OPTIONS_SQL = `
SELECT f.code AS "facetCode", ft.name AS "facetName", fv.code AS "valueCode", vt.name AS "valueName"
FROM facet f
JOIN facet_channels_channel fc ON fc."facetId" = f.id AND fc."channelId" = $1
LEFT JOIN LATERAL (
    SELECT name FROM facet_translation WHERE "baseId" = f.id AND "languageCode" IN ($2, $3)
    ORDER BY ("languageCode" = $2) DESC LIMIT 1
) ft ON true
LEFT JOIN facet_value fv ON fv."facetId" = f.id
    AND EXISTS (SELECT 1 FROM facet_value_channels_channel vc WHERE vc."facetValueId" = fv.id AND vc."channelId" = $1)
LEFT JOIN LATERAL (
    SELECT name FROM facet_value_translation WHERE "baseId" = fv.id AND "languageCode" IN ($2, $3)
    ORDER BY ("languageCode" = $2) DESC LIMIT 1
) vt ON true
ORDER BY f.code, vt.name, fv.code`;

// About 7.6k facet values in the largest catalog.
const FACET_OPTIONS_CEILING = 30000;

export function groupFacetOptionRows(rows: FacetOptionRow[]): DiscountFacetOption[] {
    const byCode = new Map<string, DiscountFacetOption>();
    for (const row of rows) {
        let facet = byCode.get(row.facetCode);
        if (!facet) {
            facet = { code: row.facetCode, name: row.facetName ?? row.facetCode, values: [] };
            byCode.set(row.facetCode, facet);
        }
        if (row.valueCode) {
            facet.values.push({ code: row.valueCode, name: row.valueName ?? row.valueCode });
        }
    }
    return [...byCode.values()];
}

export async function loadDiscountFacetOptions(
    connection: TransactionalConnection,
    ctx: RequestContext,
    defaultLanguage: string,
    ceiling: number = FACET_OPTIONS_CEILING,
): Promise<DiscountFacetOption[]> {
    const rows = await ctxQueryBounded<FacetOptionRow>(
        connection,
        ctx,
        FACET_OPTIONS_SQL,
        [ctx.channelId, ctx.languageCode, defaultLanguage],
        ceiling,
    );
    return groupFacetOptionRows(rows);
}
