import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationPriceHandler';

// Mirrors erp-import's own PriceHandler shape (variant lookup by sku, upsert into
// product_variant_price_entry) — same target table, same raw-querybuilder-by-table-name
// precedent already established there for this exact kind of cross-cutting price write.
@Injectable()
export class PriceStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const sku = String(payload.sku ?? '');
        const priceTypeCode = String(payload.priceTypeCode ?? '');
        const price = Number(payload.price ?? NaN);
        if (!sku || !priceTypeCode || Number.isNaN(price)) {
            Logger.warn(`price ${entityId}: missing sku/priceTypeCode/price, skipping`, loggerCtx);
            return;
        }

        const variant = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .where('pv.sku = :sku', { sku })
            .getRawOne<{ id: string }>();

        if (!variant) {
            Logger.warn(`price ${entityId}: variant not found for sku=${sku}`, loggerCtx);
            return;
        }

        const priceInCents = Math.round(price * 100);
        const existing = await this.connection.rawConnection
            .createQueryBuilder()
            .select('cp.id', 'id')
            .from('product_variant_price_entry', 'cp')
            .where('cp."variantId" = :variantId AND cp."priceTypeCode" = :code', {
                variantId: variant.id,
                code: priceTypeCode,
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
                .values({ variantId: variant.id, priceTypeCode, price: priceInCents })
                .execute();
        }
        Logger.verbose(`Upserted price sku=${sku} type=${priceTypeCode}`, loggerCtx);
    }
}
