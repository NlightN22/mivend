import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { StockRecord } from '../types';

const loggerCtx = 'ErpStockHandler';

@Injectable()
export class StockHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: StockRecord): Promise<void> {
        const variant = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .where('pv.sku = :sku', { sku: record.sku })
            .getRawOne<{ id: string }>();

        if (!variant) {
            Logger.warn(`Stock update: variant not found for sku=${record.sku}`, loggerCtx);
            return;
        }

        await this.connection.rawConnection
            .createQueryBuilder()
            .update('stock_level')
            .set({ stockOnHand: record.stockOnHand })
            .where('"productVariantId" = :id', { id: variant.id })
            .execute();

        Logger.verbose(`Updated stock sku=${record.sku} qty=${record.stockOnHand}`, loggerCtx);
    }
}
