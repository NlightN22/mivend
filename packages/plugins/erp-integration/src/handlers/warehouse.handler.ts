import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, StockLocationService, TransactionalConnection } from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationWarehouseHandler';

// Applies Integration Service's `warehouse` stream (WarehouseChanged: name/departmentId/isActive/
// isFolder — entityId is the warehouse's own ERP GUID, departmentId is the owning division's ERP
// GUID ("Подразделение_Key"), matched against Branch.erpId here — same id space as Department's
// own erpId (event-contracts@0.40.0 renamed this field from branch_id for clarity, see that
// package's issue #140), but mivend's Branch stays its own independent, staff-managed concept
// (see DepartmentStreamHandler's own comment) — an unresolved match here is expected, not a bug.
// Confirmed architecture (issue #63 plan): warehouse-level stock uses Vendure's
// native StockLocation, one per Warehouse — not Channel, since a branch is a soft staff-grouping
// tag here, not a hard catalog/pricing partition. StockLocation has no native external-id field,
// so StockLocation.customFields.warehouseErpId is this handler's own idempotency key.
//
// The ERP's warehouse hierarchy has folder/group nodes as well as real leaf warehouses (issue #94).
// isFolder === true skips the row entirely — no Warehouse, no StockLocation. Vendure has no
// native hierarchy concept for StockLocation, and Branch already covers the organizational
// grouping need, so no synthetic folder representation is introduced.
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
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3 bool
        // zero-value omission).
        const isActive = payload.isActive === true;
        const isDeleted = payload.isDeleted === true;
        // The ERP's warehouse hierarchy includes folder/group nodes, not just real leaf warehouses
        // (issue #94) — Vendure has no StockLocation/Warehouse hierarchy concept, and Branch
        // already covers the organizational grouping need, so folders are skipped entirely.
        const isFolder = payload.isFolder === true;
        if (isFolder) {
            Logger.verbose(`Skipping folder warehouse node erpId=${entityId}`, loggerCtx);
            return;
        }

        const name = payload.name ? String(payload.name) : null;
        if (!name) {
            // A deletion tombstone (isDeleted:true) never carries a name — confirmed against
            // real staging-integration payloads (mivend.issue.84.88 follow-up). Still update
            // isActive on an already-known warehouse; never fabricate a brand-new one with a
            // blank name.
            const updated = await this.warehouseService.setActiveStateIfExists(
                ctx,
                entityId,
                isActive && !isDeleted,
            );
            if (!updated) {
                Logger.warn(
                    `warehouse ${entityId}: missing name and no existing row, skipping`,
                    loggerCtx,
                );
            }
            return;
        }

        // An empty/missing departmentId (malformed payload) is handled the same as an unresolvable
        // one — WarehouseService.upsert leaves branchId null either way, never a reason to skip
        // creating the Warehouse itself.
        const departmentId = String(payload.departmentId ?? '');

        await this.warehouseService.upsert(ctx, {
            erpId: entityId,
            name,
            branchErpId: departmentId,
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
