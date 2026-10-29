import { Injectable } from '@nestjs/common';
import { mainContractPriceTypeIdSql } from '@mivend/plugin-customer-pricing';
import { Logger, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ctxQuery } from 'shared';

const loggerCtx = 'PriceEntryPlugin';

export interface PriceEntryInput {
    variantId: string;
    priceTypeCode: string;
    price: number;
}

export interface PriceEntryView {
    id: string;
    variantId: string;
    priceTypeCode: string;
    price: number;
}

const PER_VARIANT_LOOKUP_MAX = 500;

const UPSERT_CONFLICT = `ON CONFLICT ("productExternalId", "priceTypeCode")
    DO UPDATE SET "price" = EXCLUDED."price", "updatedAt" = now()`;

// The variant -> product -> ERP id join stays here so callers keep working with variant ids.
@Injectable()
export class PriceEntryService {
    constructor(private connection: TransactionalConnection) {}

    async upsert(
        ctx: RequestContext,
        variantId: string,
        priceTypeCode: string,
        price: number,
    ): Promise<PriceEntryView> {
        const rows = await ctxQuery<Array<{ id: number }>>(
            this.connection,
            ctx,
            `INSERT INTO product_variant_price_entry ("productExternalId", "priceTypeCode", "price")
             SELECT p."customFieldsExternalid", $2, $3
               FROM product_variant pv JOIN product p ON p.id = pv."productId"
              WHERE pv.id = $1::int AND p."customFieldsExternalid" IS NOT NULL
             ${UPSERT_CONFLICT}
             RETURNING id`,
            [variantId, priceTypeCode, price],
        );
        if (!rows[0]) throw new UserInputError(`Variant ${variantId} has no product ERP id`);
        return { id: String(rows[0].id), variantId, priceTypeCode, price };
    }

    async upsertByProduct(
        ctx: RequestContext,
        productExternalId: string,
        priceTypeCode: string,
        price: number,
    ): Promise<void> {
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO product_variant_price_entry ("productExternalId", "priceTypeCode", "price")
             VALUES ($1, $2, $3) ${UPSERT_CONFLICT}`,
            [productExternalId, priceTypeCode, price],
        );
    }

    async removeByProduct(
        ctx: RequestContext,
        productExternalId: string,
        priceTypeCode: string,
    ): Promise<boolean> {
        const rows = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `WITH d AS (DELETE FROM product_variant_price_entry
                         WHERE "productExternalId" = $1 AND "priceTypeCode" = $2 RETURNING 1)
             SELECT count(*)::int AS n FROM d`,
            [productExternalId, priceTypeCode],
        );
        return rows[0].n > 0;
    }

    async bulkUpsert(ctx: RequestContext, entries: PriceEntryInput[]): Promise<number> {
        if (entries.length === 0) return 0;
        const rows = await ctxQuery<unknown[]>(
            this.connection,
            ctx,
            `INSERT INTO product_variant_price_entry ("productExternalId", "priceTypeCode", "price")
             SELECT DISTINCT ON (p."customFieldsExternalid", e.code) p."customFieldsExternalid", e.code, e.price
               FROM unnest($1::int[], $2::varchar[], $3::bigint[]) WITH ORDINALITY AS e(variant_id, code, price, ord)
               JOIN product_variant pv ON pv.id = e.variant_id
               JOIN product p ON p.id = pv."productId"
              WHERE p."customFieldsExternalid" IS NOT NULL
              ORDER BY p."customFieldsExternalid", e.code, e.ord DESC
             ${UPSERT_CONFLICT}
             RETURNING id`,
            [
                entries.map(e => e.variantId),
                entries.map(e => e.priceTypeCode),
                entries.map(e => e.price),
            ],
        );
        Logger.verbose(`Bulk upserted ${rows.length} price entries`, loggerCtx);
        return rows.length;
    }

    async getForVariant(
        ctx: RequestContext,
        variantId: string,
        priceTypeCode: string,
    ): Promise<number | null> {
        const rows = await ctxQuery<Array<{ price: string }>>(
            this.connection,
            ctx,
            `SELECT pe.price FROM product_variant pv
               JOIN product p ON p.id = pv."productId"
               JOIN product_variant_price_entry pe
                 ON pe."productExternalId" = p."customFieldsExternalid" AND pe."priceTypeCode" = $2
              WHERE pv.id = $1::int`,
            [variantId, priceTypeCode],
        );
        return rows[0] ? Number(rows[0].price) : null;
    }

    // Small lists: OFFSET 0 pins per-variant index lookups, the planner would scan all of product.
    // Large lists: the plain join lets it hash-join, which is faster past a few hundred ids.
    async getForVariants(
        ctx: RequestContext,
        variantIds: string[],
        priceTypeCode: string,
    ): Promise<Map<string, number>> {
        if (variantIds.length === 0) return new Map();
        const productExt =
            variantIds.length <= PER_VARIANT_LOOKUP_MAX
                ? `CROSS JOIN LATERAL (SELECT p."customFieldsExternalid" AS ext FROM product p
                                        WHERE p.id = pv."productId" OFFSET 0) p`
                : `JOIN (SELECT id, "customFieldsExternalid" AS ext FROM product) p ON p.id = pv."productId"`;
        const rows = await ctxQuery<Array<{ variantId: number; price: string }>>(
            this.connection,
            ctx,
            `SELECT pv.id AS "variantId", pe.price FROM product_variant pv
               ${productExt}
               JOIN product_variant_price_entry pe
                 ON pe."productExternalId" = p.ext AND pe."priceTypeCode" = $2
              WHERE pv.id = ANY($1::int[])`,
            [variantIds, priceTypeCode],
        );
        return new Map(rows.map(r => [String(r.variantId), Number(r.price)]));
    }

    async getPriceTypeCodeForUser(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const rows = await ctxQuery<Array<{ code: string }>>(
            this.connection,
            ctx,
            `SELECT pt.code
             FROM customer cu
             JOIN price_type pt ON pt."isPurchase" = false AND pt.id = COALESCE(
                 ${mainContractPriceTypeIdSql('cu.id')},
                 (SELECT cpt."priceTypeId" FROM customer_price_type cpt
                  WHERE cpt."customerId"::varchar = cu.id::varchar LIMIT 1))
             WHERE cu."userId" = $1
             LIMIT 1`,
            [ctx.activeUserId],
        );
        return rows?.[0]?.code ?? null;
    }

    // ctx.activeUserId is the admin here, not the customer, so getPriceTypeCodeForUser would
    // resolve nothing and silently fall back to list price.
    async getPriceTypeCodeForCustomer(
        ctx: RequestContext,
        customerId: string,
    ): Promise<string | null> {
        const rows = await ctxQuery<Array<{ code: string }>>(
            this.connection,
            ctx,
            `SELECT pt.code
             FROM price_type pt
             WHERE pt."isPurchase" = false AND pt.id = COALESCE(
                 ${mainContractPriceTypeIdSql('$1')},
                 (SELECT cpt."priceTypeId" FROM customer_price_type cpt
                  WHERE cpt."customerId"::varchar = $1 LIMIT 1))`,
            [customerId],
        );
        return rows?.[0]?.code ?? null;
    }

    // Skips purchase types (never a selling price); BranchSettings.defaultPriceTypeId is an id, lookups are by code.
    async getPriceTypeCodeById(ctx: RequestContext, priceTypeId: string): Promise<string | null> {
        const rows = await ctxQuery<Array<{ code: string }>>(
            this.connection,
            ctx,
            `SELECT code FROM price_type WHERE id::varchar = $1 AND "isPurchase" = false LIMIT 1`,
            [priceTypeId],
        );
        return rows?.[0]?.code ?? null;
    }
}
