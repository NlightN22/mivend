import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, StockLocationService, TransactionalConnection } from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationWarehouseHandler';

// Unresolved departmentId->Branch match is expected: Branch is independent, staff-managed.
// StockLocation has no external-id field, so customFields.warehouseErpId is the idempotency key.
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
    ): Promise<InboundOutcome> {
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3 bool
        // zero-value omission).
        const isActive = payload.isActive === true;
        const isDeleted = payload.isDeleted === true;
        // Vendure has no StockLocation hierarchy, and Branch already covers grouping,
        // so ERP folder nodes are skipped rather than mirrored as synthetic locations.
        const isFolder = payload.isFolder === true;
        if (isFolder) {
            return inboundNoop(`Skipping folder warehouse node erpId=${entityId}`);
        }

        const name = payload.name ? String(payload.name) : null;
        if (!name) {
            // A deletion tombstone (isDeleted) has no name, so it must never create a new Warehouse.
            // It may still update isActive on an existing one.
            const updated = await this.warehouseService.setActiveStateIfExists(
                ctx,
                entityId,
                isActive && !isDeleted,
            );
            return updated
                ? inboundApplied()
                : inboundNoop(`warehouse ${entityId}: missing name and no existing row, skipping`);
        }

        // An empty or missing departmentId is treated like an unresolvable one: branchId stays null,
        // and the Warehouse is still created, so a bad payload never skips it.
        const departmentId = String(payload.departmentId ?? '');

        await this.warehouseService.upsert(ctx, {
            erpId: entityId,
            name,
            branchErpId: departmentId,
            isActive: isActive && !isDeleted,
        });

        await this.ensureStockLocation(ctx, entityId, name);
        Logger.verbose(`Upserted warehouse erpId=${entityId}`, loggerCtx);
        return inboundApplied();
    }

    private async ensureStockLocation(
        ctx: RequestContext,
        warehouseErpId: string,
        name: string,
    ): Promise<InboundOutcome | void> {
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
