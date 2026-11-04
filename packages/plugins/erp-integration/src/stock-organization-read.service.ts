import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { StockOrganization } from './entities/stock-organization.entity';

@Injectable()
export class StockOrganizationReadService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Negative balances are kept; deactivated rows (isActive=false) are not part of available stock.
    async getOrganizationStockByProduct(
        ctx: RequestContext,
        productErpIds: string[],
    ): Promise<Map<string, Map<string, number>>> {
        const byProduct = new Map<string, Map<string, number>>();
        if (productErpIds.length === 0) return byProduct;
        const rows = await this.connection
            .getRepository(ctx, StockOrganization)
            .find({ where: { productId: In(productErpIds), isActive: true } });
        for (const row of rows) {
            const totals = byProduct.get(row.productId) ?? new Map<string, number>();
            totals.set(
                row.organizationErpId,
                (totals.get(row.organizationErpId) ?? 0) + row.quantity,
            );
            byProduct.set(row.productId, totals);
        }
        return byProduct;
    }
}
