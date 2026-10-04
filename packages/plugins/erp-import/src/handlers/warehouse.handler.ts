import { Injectable } from '@nestjs/common';
import { RequestContext, StockLocationService, TransactionalConnection } from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';
import type { WarehouseRecord } from '../types';

@Injectable()
export class WarehouseHandler {
    constructor(
        private readonly warehouseService: WarehouseService,
        private readonly stockLocationService: StockLocationService,
        private readonly connection: TransactionalConnection,
    ) {}

    async upsert(ctx: RequestContext, record: WarehouseRecord): Promise<void> {
        await this.warehouseService.upsert(ctx, {
            erpId: record.erpId,
            name: record.name,
            branchErpId: record.branchErpId,
            isActive: record.isActive,
        });
        await this.ensureStockLocation(ctx, record);
    }

    private async ensureStockLocation(ctx: RequestContext, record: WarehouseRecord): Promise<void> {
        const bound = await this.connection.rawConnection
            .createQueryBuilder()
            .select('sl.id', 'id')
            .from('stock_location', 'sl')
            .where('sl."customFieldsWarehouseerpid" = :erpId', { erpId: record.erpId })
            .getRawOne<{ id: string }>();
        if (bound) return;

        const adoptable = record.stockLocationName
            ? await this.connection.rawConnection
                  .createQueryBuilder()
                  .select('sl.id', 'id')
                  .from('stock_location', 'sl')
                  .where('sl.name = :name', { name: record.stockLocationName })
                  .andWhere('sl."customFieldsWarehouseerpid" IS NULL')
                  .getRawOne<{ id: string }>()
            : undefined;
        if (adoptable) {
            await this.stockLocationService.update(ctx, {
                id: adoptable.id,
                customFields: { warehouseErpId: record.erpId },
            });
            return;
        }

        await this.stockLocationService.create(ctx, {
            name: record.name,
            customFields: { warehouseErpId: record.erpId },
        });
    }
}
