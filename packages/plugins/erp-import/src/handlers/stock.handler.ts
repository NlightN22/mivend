import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, StockLevel, TransactionalConnection } from '@vendure/core';
import type { StockRecord } from '../types';

const loggerCtx = 'ErpStockHandler';

@Injectable()
export class StockHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: StockRecord): Promise<void> {
        const variant = await this.connection
            .getRepository(ctx, 'Channel')
            .manager.createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .where('pv.sku = :sku', { sku: record.sku })
            .getRawOne<{ id: string }>();

        if (!variant) {
            Logger.warn(`Stock update: variant not found for sku=${record.sku}`, loggerCtx);
            return;
        }

        if (record.warehouseErpId) {
            await this.upsertWarehouseLevel(
                ctx,
                variant.id,
                record.warehouseErpId,
                record.stockOnHand,
            );
            return;
        }

        await this.connection
            .getRepository(ctx, 'Channel')
            .manager.createQueryBuilder()
            .update('stock_level')
            .set({ stockOnHand: record.stockOnHand })
            .where('"productVariantId" = :id', { id: variant.id })
            .execute();

        Logger.verbose(`Updated stock sku=${record.sku} qty=${record.stockOnHand}`, loggerCtx);
    }

    private async upsertWarehouseLevel(
        ctx: RequestContext,
        productVariantId: string,
        warehouseErpId: string,
        stockOnHand: number,
    ): Promise<void> {
        const location = await this.connection
            .getRepository(ctx, 'Channel')
            .manager.createQueryBuilder()
            .select('sl.id', 'id')
            .from('stock_location', 'sl')
            .where('sl."customFieldsWarehouseerpid" = :erpId', { erpId: warehouseErpId })
            .getRawOne<{ id: string }>();
        if (!location) {
            Logger.warn(
                `Stock update: warehouse ${warehouseErpId} has no stock location`,
                loggerCtx,
            );
            return;
        }
        const levels = this.connection.getRepository(ctx, StockLevel);
        const existing = await levels.findOne({
            where: { productVariantId, stockLocationId: location.id },
        });
        await levels.save(
            existing
                ? Object.assign(existing, { stockOnHand })
                : levels.create({
                      productVariantId,
                      stockLocationId: location.id,
                      stockOnHand,
                      stockAllocated: 0,
                  }),
        );
    }
}
