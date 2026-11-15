import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

const NAMES_PER_DOCUMENT = 3;
const PRODUCT_IDS_PER_DOCUMENT = 5;

export interface LineSummary {
    lineCount: number;
    productNames: string[];
}

// One query per page for the line counts and first products, one more for the product names: no per-row reads.
@Injectable()
export class ErpDocumentLineSummaryService {
    constructor(private readonly connection: TransactionalConnection) {}

    async summarize(
        ctx: RequestContext,
        lineTables: readonly string[],
        documentIds: number[],
    ): Promise<Map<number, LineSummary>> {
        const result = new Map<number, LineSummary>();
        if (documentIds.length === 0) return result;
        const union = lineTables
            .map(
                table =>
                    `SELECT "documentId", "lineNumber", "productId" FROM "${table}" WHERE "documentId" = ANY($1::int[])`,
            )
            .join(' UNION ALL ');
        // unbounded-ok: one row per document of the requested page, at most MAX_TAKE
        const rows = await ctxQuery<
            Array<{ documentId: number; lineCount: number; productIds: string[] }>
        >(
            this.connection,
            ctx,
            `SELECT "documentId", COUNT(*)::int AS "lineCount",
                    (array_agg("productId" ORDER BY "lineNumber") FILTER (WHERE "productId" IS NOT NULL))[1:${PRODUCT_IDS_PER_DOCUMENT}] AS "productIds"
             FROM (${union}) l GROUP BY "documentId"`,
            [documentIds],
        );
        const names = await this.productNames(
            ctx,
            rows.flatMap(r => r.productIds ?? []),
        );
        for (const row of rows) {
            const productNames = new Set<string>();
            for (const id of row.productIds ?? []) {
                const name = names.get(id);
                if (name) productNames.add(name);
            }
            result.set(row.documentId, {
                lineCount: row.lineCount,
                productNames: [...productNames].slice(0, NAMES_PER_DOCUMENT),
            });
        }
        return result;
    }

    private async productNames(
        ctx: RequestContext,
        productIds: Array<string | null>,
    ): Promise<Map<string, string>> {
        const ids = [...new Set(productIds.filter((id): id is string => Boolean(id)))];
        if (ids.length === 0) return new Map();
        const rows = await ctxQuery<Array<{ externalId: string; name: string }>>(
            this.connection,
            ctx,
            `SELECT p."customFieldsExternalid" AS "externalId", pt."name"
             FROM product p JOIN product_translation pt ON pt."baseId" = p.id AND pt."languageCode" = $2
             WHERE p."customFieldsExternalid" = ANY($1::text[])`,
            [ids, ctx.languageCode],
        );
        return new Map(rows.map(r => [r.externalId, r.name]));
    }
}
