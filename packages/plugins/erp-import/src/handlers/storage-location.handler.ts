import { Injectable } from '@nestjs/common';
import { ctxQuery } from 'shared';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { StorageLocationRecord } from '../types';

// Writes the ERP-owned table directly: its owning plugin (erp-integration) is not a dependency of this one.
@Injectable()
export class StorageLocationHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: StorageLocationRecord): Promise<void> {
        await ctxQuery<unknown>(
            this.connection,
            ctx,
            `INSERT INTO storage_location_assignment ("entityId", "productId", "organizationErpId", "warehouseId", priority)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ("entityId")
             DO UPDATE SET "productId" = EXCLUDED."productId", "organizationErpId" = EXCLUDED."organizationErpId",
                 "warehouseId" = EXCLUDED."warehouseId", priority = EXCLUDED.priority, "updatedAt" = now()`,
            [
                record.entityId,
                record.productErpId,
                record.organizationErpId,
                record.warehouseErpId,
                record.priority ?? 0,
            ],
        );
    }
}
