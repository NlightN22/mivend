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
