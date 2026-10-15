import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { StockOrganization } from './entities/stock-organization.entity';

@Injectable()
export class StockOrganizationReadService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Negative balances are kept; deactivated rows (isActive=false) are not part of available stock.
    async getOrganizationStock(
        ctx: RequestContext,
        productErpIds: string[],
    ): Promise<Map<string, number>> {
        const totals = new Map<string, number>();
        if (productErpIds.length === 0) return totals;
        const rows = await this.connection
            .getRepository(ctx, StockOrganization)
            .find({ where: { productId: In(productErpIds), isActive: true } });
        for (const row of rows) {
            totals.set(
                row.organizationErpId,
                (totals.get(row.organizationErpId) ?? 0) + row.quantity,
            );
        }
        return totals;
    }
}
