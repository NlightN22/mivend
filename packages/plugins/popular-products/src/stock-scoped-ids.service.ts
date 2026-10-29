import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { StockLevelService, andProductInStock } from '@mivend/plugin-reservation';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

const OVERFETCH = 3;
const MAX_TAKE = 50;

// Shared by the home widgets: ids come back in-stock at the viewer's branch warehouses, with spare
// ids because the following `products` call drops products hidden from the viewer.
@Injectable()
export class StockScopedIdsService {
    constructor(private stockLevelService: StockLevelService) {}

    clampTake(take: number | null | undefined, fallback: number): number {
        return Math.min(Math.max(take ?? fallback, 1), MAX_TAKE);
    }

    async run<T extends ObjectLiteral>(
        ctx: RequestContext,
        take: number,
        query: SelectQueryBuilder<T>,
    ): Promise<string[]> {
        const warehouseErpIds = await this.stockLevelService.getViewerWarehouseErpIds(ctx);
        if (warehouseErpIds.length === 0) return [];
        const rows = await andProductInStock(query, warehouseErpIds)
            .limit(take * OVERFETCH)
            .getRawMany<{ productId: string }>();
        return rows.map(row => String(row.productId));
    }
}
