import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, StockLocation, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';
import { loggerCtx } from './types';

export interface WarehouseRecordInput {
    erpId: string;
    name: string;
    branchErpId: string;
    isActive: boolean;
}

export class WarehouseNotFoundError extends Error {
    constructor(warehouseId: string) {
        super(`Warehouse ${warehouseId} not found`);
    }
}

@Injectable()
export class WarehouseService {
    constructor(private connection: TransactionalConnection) {}

    // Out-of-order delivery guard, relaxed (issue #80 follow-up): a Warehouse's owning Branch
    // may not have been synced yet (branch/warehouse are independent Kafka streams — no
    // delivery-order guarantee across streams), or mivend's own Branch consolidation may be
    // entirely independent of whatever branch id the ERP sends (a manually-created Branch's
    // erpId never matches a real ERP GUID at all — see BranchService.createManual). Either way,
    // the Warehouse itself must still be created/updated — leaving branchId null rather than
    // skipping the whole row is what lets staff assign it manually afterwards (manager portal's
    // WarehouseCurationTable). Previously this returned null and created nothing, which meant a
    // warehouse could never appear at all until a matching ERP-sourced Branch existed — a real,
    // live-found dead end for any Branch created manually instead.
    async upsert(ctx: RequestContext, record: WarehouseRecordInput): Promise<Warehouse> {
        const branch = await this.connection
            .getRepository(ctx, Branch)
            .findOne({ where: { erpId: record.branchErpId } });
        if (!branch) {
            Logger.warn(
                `warehouse erpId=${record.erpId}: branch erpId=${record.branchErpId} not found — ` +
                    `creating/updating unassigned (staff can assign a branch manually)`,
                loggerCtx,
            );
        }

        const repo = this.connection.getRepository(ctx, Warehouse);
        const branchId = branch ? String(branch.id) : null;
        let warehouse = await repo.findOne({ where: { erpId: record.erpId } });
        if (warehouse) {
            warehouse.name = record.name;
            // Never clobber a branch staff already assigned manually just because this later ERP
            // event still can't resolve one — only advance branchId when we actually have one.
            if (branchId) warehouse.branchId = branchId;
            warehouse.isActive = record.isActive;
        } else {
            warehouse = repo.create({
                erpId: record.erpId,
                name: record.name,
                branchId,
                isActive: record.isActive,
            });
        }
        const saved = await repo.save(warehouse);
        Logger.verbose(`Upserted warehouse erpId=${record.erpId}`, loggerCtx);
        return saved;
    }

    async findAll(ctx: RequestContext): Promise<Warehouse[]> {
        return this.connection.getRepository(ctx, Warehouse).find({ order: { name: 'ASC' } });
    }

    async findByErpId(ctx: RequestContext, erpId: string): Promise<Warehouse | null> {
        return this.connection.getRepository(ctx, Warehouse).findOne({ where: { erpId } });
    }

    // mivend.issue.84.88 follow-up: Integration Service's `warehouse` deletion tombstones never
    // carry a name (confirmed against real staging-integration payloads) — this lets a caller
    // update isActive on an already-known warehouse without fabricating a name. A deliberate
    // no-op (returns false) when no Warehouse matches erpId yet — a deletion tombstone must
    // never create a brand-new row.
    async setActiveStateIfExists(
        ctx: RequestContext,
        erpId: string,
        isActive: boolean,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, Warehouse);
        const warehouse = await repo.findOne({ where: { erpId } });
        if (!warehouse) return false;
        warehouse.isActive = isActive;
        await repo.save(warehouse);
        return true;
    }

    // Shared branch->StockLocation join, extracted so every caller that needs "which
    // StockLocations belong to this order's branch" (erp-integration's
    // BranchStockLocationStrategy, plugin-reservation's ReservationService) resolves it the same
    // way instead of each re-deriving it — a branch can have several warehouses/StockLocations,
    // never exactly one. Reads StockLocation.customFields.warehouseErpId via raw SQL, same as
    // every other cross-plugin customField read in this codebase (that field isn't declared in
    // this package's own TS project, so the typed entity doesn't expose it here).
    async findActiveStockLocationsForBranch(
        ctx: RequestContext,
        branchId: string,
    ): Promise<StockLocation[]> {
        const warehouses = (await this.findAll(ctx)).filter(
            w => w.branchId === branchId && w.isActive,
        );
        const warehouseErpIds = warehouses.map(w => w.erpId);
        if (warehouseErpIds.length === 0) return [];

        const rows = await this.connection.rawConnection
            .createQueryBuilder()
            .select('sl.id', 'id')
            .from('stock_location', 'sl')
            .where('sl."customFieldsWarehouseerpid" IN (:...erpIds)', { erpIds: warehouseErpIds })
            .getRawMany<{ id: string }>();
        if (rows.length === 0) return [];

        // Ordered by id: ReservationService.reserveOrder() takes a `FOR UPDATE` lock on every
        // candidate location's StockLevel row per line (mivend#85 audit finding) — without a
        // stable order here, two concurrent reserveOrder() calls could lock the same two
        // candidate locations in opposite order and Postgres-deadlock (40P01). BranchStockLocationStrategy
        // doesn't lock, but a stable order here costs nothing and keeps this shared join's output
        // deterministic for every caller.
        return this.connection
            .getRepository(ctx, StockLocation)
            .find({ where: { id: In(rows.map(r => r.id)) }, order: { id: 'ASC' } });
    }

    // Manager-portal curation (issue #66) — staff confirm/override the branch a Warehouse
    // belongs to and whether it counts toward that branch's ATP aggregation. the ERP's own
    // branchId/isActive (set by upsert above) stay untouched as the read-only suggested default;
    // this is the only place that ever changes includedInBranchAtp.
    async setBranchAssignment(
        ctx: RequestContext,
        warehouseId: string,
        branchId: string,
        includedInBranchAtp: boolean,
    ): Promise<Warehouse> {
        const repo = this.connection.getRepository(ctx, Warehouse);
        const warehouse = await repo.findOne({ where: { id: warehouseId } });
        if (!warehouse) {
            throw new WarehouseNotFoundError(warehouseId);
        }
        warehouse.branchId = branchId;
        warehouse.includedInBranchAtp = includedInBranchAtp;
        return repo.save(warehouse);
    }
}
