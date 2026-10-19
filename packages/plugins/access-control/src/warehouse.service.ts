import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, StockLocation, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';
import { loggerCtx } from './types';
import { ctxQuery } from 'shared';

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

    // Branch and warehouse arrive on independent Kafka streams, so the Branch may not exist yet.
    // Always upsert with branchId null instead of skipping, so staff can assign the branch manually.
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

    // Deletion tombstones from Integration Service carry no name, so only isActive is updated.
    // No-op when no Warehouse matches erpId: a tombstone must never create a row.
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

    // Raw SQL: StockLocation.customFields.warehouseErpId is not declared in this package's TS project.
    // A branch can map to several StockLocations, so callers must not assume exactly one.
    async findActiveStockLocationsForBranch(
        ctx: RequestContext,
        branchId: string,
    ): Promise<StockLocation[]> {
        const warehouses = (await this.findAll(ctx)).filter(
            w => w.branchId === branchId && w.isActive,
        );
        const warehouseErpIds = warehouses.map(w => w.erpId);
        if (warehouseErpIds.length === 0) return [];

        const rows = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT sl.id FROM stock_location sl WHERE sl."customFieldsWarehouseerpid" = ANY($1)`,
            [warehouseErpIds],
        );
        if (rows.length === 0) return [];

        // Stable id order prevents deadlock: reserveOrder() FOR UPDATE-locks candidate StockLevel rows,
        // and concurrent calls locking in opposite order would hit Postgres 40P01.
        return this.connection
            .getRepository(ctx, StockLocation)
            .find({ where: { id: In(rows.map(r => r.id)) }, order: { id: 'ASC' } });
    }

    // Staff overrides live here; ERP branchId/isActive from upsert stay untouched as defaults.
    // This is the only place includedInBranchAtp is ever changed.
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
