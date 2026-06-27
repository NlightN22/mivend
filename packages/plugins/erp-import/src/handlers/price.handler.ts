import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { PriceRecord } from '../types';

const loggerCtx = 'ErpPriceHandler';

@Injectable()
export class PriceHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: PriceRecord): Promise<void> {
        const variant = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .where('pv.sku = :sku', { sku: record.sku })
            .getRawOne<{ id: string }>();

        if (!variant) {
            Logger.warn(`Price update: variant not found for sku=${record.sku}`, loggerCtx);
            return;
        }

        const priceInCents = Math.round(record.price * 100);

        const existing = await this.connection.rawConnection
            .createQueryBuilder()
            .select('cp.id', 'id')
            .from('product_variant_price_entry', 'cp')
            .where('cp."variantId" = :variantId AND cp."priceTypeCode" = :code', {
                variantId: variant.id,
                code: record.priceTypeCode,
            })
            .getRawOne<{ id: string }>();

        if (existing) {
            await this.connection.rawConnection
                .createQueryBuilder()
                .update('product_variant_price_entry')
                .set({ price: priceInCents })
                .where('id = :id', { id: existing.id })
                .execute();
        } else {
            await this.connection.rawConnection
                .createQueryBuilder()
                .insert()
                .into('product_variant_price_entry')
                .values({
                    variantId: variant.id,
                    priceTypeCode: record.priceTypeCode,
                    price: priceInCents,
                })
                .execute();
        }

        Logger.verbose(`Upserted price sku=${record.sku} type=${record.priceTypeCode}`, loggerCtx);
    }
}
