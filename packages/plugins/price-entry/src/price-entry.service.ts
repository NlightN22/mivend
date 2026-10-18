import { Injectable } from '@nestjs/common';
import { mainContractPriceTypeIdSql } from '@mivend/plugin-customer-pricing';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductVariantPriceEntry } from './price-entry.entity';

const loggerCtx = 'PriceEntryPlugin';

export interface PriceEntryInput {
    variantId: string;
    priceTypeCode: string;
    price: number;
}

@Injectable()
export class PriceEntryService {
    constructor(private connection: TransactionalConnection) {}

    async upsert(
        ctx: RequestContext,
        variantId: string,
        priceTypeCode: string,
        price: number,
    ): Promise<ProductVariantPriceEntry> {
        const repo = this.connection.getRepository(ctx, ProductVariantPriceEntry);
        let record = await repo.findOne({ where: { variantId, priceTypeCode } });
        if (record) {
            record.price = price;
        } else {
            record = repo.create({ variantId, priceTypeCode, price });
        }
        return repo.save(record);
    }

    async bulkUpsert(ctx: RequestContext, entries: PriceEntryInput[]): Promise<number> {
        if (entries.length === 0) return 0;
        const repo = this.connection.getRepository(ctx, ProductVariantPriceEntry);
        await repo
            .createQueryBuilder()
            .insert()
            .into(ProductVariantPriceEntry)
            .values(
                entries.map(e => ({
                    variantId: e.variantId,
                    priceTypeCode: e.priceTypeCode,
                    price: e.price,
                })),
            )
            .orUpdate(['price'], ['variantId', 'priceTypeCode'])
            .execute();
        Logger.verbose(`Bulk upserted ${entries.length} price entries`, loggerCtx);
        return entries.length;
    }

    async getForVariant(
        ctx: RequestContext,
        variantId: string,
        priceTypeCode: string,
    ): Promise<number | null> {
        const record = await this.connection
            .getRepository(ctx, ProductVariantPriceEntry)
            .findOne({ where: { variantId, priceTypeCode } });
        return record ? Number(record.price) : null;
    }

    async getForVariants(
        ctx: RequestContext,
        variantIds: string[],
        priceTypeCode: string,
    ): Promise<Map<string, number>> {
        if (variantIds.length === 0) return new Map();
        const records = await this.connection
            .getRepository(ctx, ProductVariantPriceEntry)
            .createQueryBuilder('pe')
            .where('pe.variantId IN (:...ids)', { ids: variantIds })
            .andWhere('pe.priceTypeCode = :code', { code: priceTypeCode })
            .getMany();
        const map = new Map<string, number>();
        for (const r of records) {
            map.set(r.variantId, Number(r.price));
        }
        return map;
    }

    async getPriceTypeCodeForUser(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const rows = await this.connection.rawConnection.query(
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
        const rows = await this.connection.rawConnection.query(
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

    // A purchase type is never a selling price, so these lookups skip it.
    // BranchSettings.defaultPriceTypeId stores a PriceType id, not a code, while the price-entry
    // lookups above are keyed by code, so this needs an extra resolution step.
    async getPriceTypeCodeById(_ctx: RequestContext, priceTypeId: string): Promise<string | null> {
        const rows = await this.connection.rawConnection.query(
            `SELECT code FROM price_type WHERE id::varchar = $1 AND "isPurchase" = false LIMIT 1`,
            [priceTypeId],
        );
        return rows?.[0]?.code ?? null;
    }
}
