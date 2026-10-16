import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { StockOrganizationRecord } from '../types';

// Writes the ERP-owned table directly: its owning plugin (erp-integration) is not a dependency of this one.
@Injectable()
export class StockOrganizationHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async upsert(_ctx: RequestContext, record: StockOrganizationRecord): Promise<void> {
        await this.connection.rawConnection.query(
            `INSERT INTO stock_organization ("entityId", "productId", "organizationErpId", quantity, "isActive")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ("productId", "organizationErpId")
             DO UPDATE SET quantity = EXCLUDED.quantity, "isActive" = EXCLUDED."isActive", "updatedAt" = now()`,
            [
                record.entityId,
                record.productErpId,
                record.organizationErpId,
                record.quantity,
                record.isActive ?? true,
            ],
        );
    }
}
