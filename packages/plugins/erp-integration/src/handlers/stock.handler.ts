import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationStockHandler';

// Mirrors erp-import's own StockHandler shape (variant lookup by sku, update stock_level).
@Injectable()
export class StockStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const sku = String(payload.sku ?? '');
        const stockOnHand = Number(payload.stockOnHand ?? NaN);
        if (!sku || Number.isNaN(stockOnHand)) {
            Logger.warn(`stock ${entityId}: missing sku/stockOnHand, skipping`, loggerCtx);
            return;
        }

        const variant = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .where('pv.sku = :sku', { sku })
            .getRawOne<{ id: string }>();

        if (!variant) {
            Logger.warn(`stock ${entityId}: variant not found for sku=${sku}`, loggerCtx);
            return;
        }

        await this.connection.rawConnection
            .createQueryBuilder()
            .update('stock_level')
            .set({ stockOnHand })
            .where('"productVariantId" = :id', { id: variant.id })
            .execute();
        Logger.verbose(`Updated stock sku=${sku} qty=${stockOnHand}`, loggerCtx);
    }
}
