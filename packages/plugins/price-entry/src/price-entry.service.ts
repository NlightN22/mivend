import { Injectable } from '@nestjs/common';
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

    // Price types are ERP master data (see AGENTS.md — "no hardcoded business enums") with no
    // dedicated list query until now — needed by the manager portal's "New discount grant" form
    // (docs/ai/manager-portal-pages/09-discounts.md) so its price-type select isn't limited by
    // the caller's own counterparty scope (which would leave a Manager with no assigned clients
    // unable to pick any price type at all).
    async listPriceTypeCodes(_ctx: RequestContext): Promise<string[]> {
        const rows = await this.connection.rawConnection.query(
            `SELECT code FROM price_type ORDER BY code`,
        );
        return rows.map((row: { code: string }) => row.code);
    }

    async getPriceTypeCodeForUser(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const rows = await this.connection.rawConnection.query(
            `SELECT pt.code
             FROM price_type pt
             JOIN customer_price_type cpt ON cpt."priceTypeId" = pt.id
             JOIN customer cu ON cu.id::varchar = cpt."customerId"::varchar
             WHERE cu."userId" = $1
             LIMIT 1`,
            [ctx.activeUserId],
        );
        return rows?.[0]?.code ?? null;
    }

    // Used when an order's customer is known but isn't the caller (an administrator building
    // an order on a customer's behalf via the manager portal — see docs/ai/manager-portal-pages/
    // 02b-order-create.md). ctx.activeUserId is the ADMIN's user in that case, not the
    // customer's, so getPriceTypeCodeForUser would resolve nothing and silently fall back to
    // list price. See PriceResolutionService.resolve().
    async getPriceTypeCodeForCustomer(
        ctx: RequestContext,
        customerId: string,
    ): Promise<string | null> {
        const rows = await this.connection.rawConnection.query(
            `SELECT pt.code
             FROM price_type pt
             JOIN customer_price_type cpt ON cpt."priceTypeId" = pt.id
             WHERE cpt."customerId"::varchar = $1
             LIMIT 1`,
            [customerId],
        );
        return rows?.[0]?.code ?? null;
    }
}
