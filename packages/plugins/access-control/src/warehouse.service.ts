import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

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

    // Out-of-order delivery guard: a Warehouse's owning Branch may not have been synced yet
    // (branch/warehouse are independent Kafka streams — no delivery-order guarantee across
    // streams). Log and skip rather than creating a dangling warehouse with no resolvable
    // branch — a later retry of this same event (or a later Warehouse update) resolves it once
    // the branch exists, same shape as PriceStreamHandler's not-found handling.
    async upsert(ctx: RequestContext, record: WarehouseRecordInput): Promise<Warehouse | null> {
        const branch = await this.connection
            .getRepository(ctx, Branch)
            .findOne({ where: { erpId: record.branchErpId } });
        if (!branch) {
            Logger.warn(
                `Skipping warehouse erpId=${record.erpId}: branch erpId=${record.branchErpId} not found`,
                loggerCtx,
            );
            return null;
        }

        const repo = this.connection.getRepository(ctx, Warehouse);
        let warehouse = await repo.findOne({ where: { erpId: record.erpId } });
        if (warehouse) {
            warehouse.name = record.name;
            warehouse.branchId = String(branch.id);
            warehouse.isActive = record.isActive;
        } else {
            warehouse = repo.create({
                erpId: record.erpId,
                name: record.name,
                branchId: String(branch.id),
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

    // Manager-portal curation (issue #66) — staff confirm/override the branch a Warehouse
    // belongs to and whether it counts toward that branch's ATP aggregation. 1C's own
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
