import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, StockLocationService, TransactionalConnection } from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationWarehouseHandler';

// Applies Integration Service's `warehouse` stream (WarehouseChanged: name/branchId/isActive —
// entityId is the warehouse's own 1C GUID, branchId is the owning division's 1C GUID = Branch
// .erpId). Confirmed architecture (issue #63 plan): warehouse-level stock uses Vendure's native
// StockLocation, one per Warehouse — not Channel, since a branch is a soft staff-grouping tag
// here, not a hard catalog/pricing partition. StockLocation has no native external-id field, so
// StockLocation.customFields.warehouseErpId is this handler's own idempotency key.
@Injectable()
export class WarehouseStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly warehouseService: WarehouseService,
        private readonly stockLocationService: StockLocationService,
        private readonly connection: TransactionalConnection,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const name = String(payload.name ?? '');
        if (!name) {
            Logger.warn(`warehouse ${entityId}: missing name, skipping`, loggerCtx);
            return;
        }
        // An empty/missing branchId (malformed payload) is handled the same as an unresolvable
        // one — WarehouseService.upsert leaves branchId null either way, never a reason to skip
        // creating the Warehouse itself.
        const branchId = String(payload.branchId ?? '');
        const isActive = payload.isActive !== false;
        const isDeleted = payload.isDeleted === true;

        await this.warehouseService.upsert(ctx, {
            erpId: entityId,
            name,
            branchErpId: branchId,
            isActive: isActive && !isDeleted,
        });

        await this.ensureStockLocation(ctx, entityId, name);
        Logger.verbose(`Upserted warehouse erpId=${entityId}`, loggerCtx);
    }

    private async ensureStockLocation(
        ctx: RequestContext,
        warehouseErpId: string,
        name: string,
    ): Promise<void> {
        const existing = await this.connection.rawConnection
            .createQueryBuilder()
            .select('sl.id', 'id')
            .from('stock_location', 'sl')
            .where('sl."customFieldsWarehouseerpid" = :erpId', { erpId: warehouseErpId })
            .getRawOne<{ id: string }>();

        if (existing) {
            await this.stockLocationService.update(ctx, {
                id: existing.id,
                name,
            });
            return;
        }

        await this.stockLocationService.create(ctx, {
            name,
            customFields: { warehouseErpId },
        });
    }
}
