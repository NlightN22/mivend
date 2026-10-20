import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { BranchAssignmentService } from './branch-assignment.service';
import { Department } from './entities/department.entity';
import { loggerCtx } from './types';

export interface DepartmentRecordInput {
    erpId: string;
    name: string;
    parentErpId?: string | null;
    // Optional so erp-import's own DepartmentRecordDto (which never carried this field) keeps
    // compiling unchanged — omitted means "assume active", matching this column's own default.
    isActive?: boolean;
}

@Injectable()
export class DepartmentService {
    constructor(
        private connection: TransactionalConnection,
        private branchAssignment: BranchAssignmentService,
    ) {}

    async upsert(ctx: RequestContext, record: DepartmentRecordInput): Promise<Department> {
        const repo = this.connection.getRepository(ctx, Department);
        let department = await repo.findOne({ where: { erpId: record.erpId } });
        const parentChanged =
            !department || department.parentErpId !== (record.parentErpId ?? null);
        if (department) {
            department.name = record.name;
            department.parentErpId = record.parentErpId ?? null;
            department.isActive = record.isActive ?? true;
        } else {
            department = repo.create({
                erpId: record.erpId,
                name: record.name,
                parentErpId: record.parentErpId ?? null,
                isActive: record.isActive ?? true,
            });
        }
        const saved = await repo.save(department);
        if (parentChanged) await this.branchAssignment.reconcileSubtree(ctx, record.erpId);
        Logger.verbose(`Upserted department erpId=${record.erpId}`, loggerCtx);
        return saved;
    }

    // Integration Service department deletion tombstones carry no name, so isActive is updated
    // without fabricating one; returns false as a no-op when no Department matches erpId yet.
    async setActiveStateIfExists(
        ctx: RequestContext,
        erpId: string,
        isActive: boolean,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, Department);
        const department = await repo.findOne({ where: { erpId } });
        if (!department) return false;
        department.isActive = isActive;
        await repo.save(department);
        return true;
    }

    async findAll(ctx: RequestContext): Promise<Department[]> {
        return this.connection.getRepository(ctx, Department).find({ order: { name: 'ASC' } });
    }
}
