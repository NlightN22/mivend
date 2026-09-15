import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

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
    constructor(private connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: DepartmentRecordInput): Promise<Department> {
        const repo = this.connection.getRepository(ctx, Department);
        let department = await repo.findOne({ where: { erpId: record.erpId } });
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
        Logger.verbose(`Upserted department erpId=${record.erpId}`, loggerCtx);
        return saved;
    }

    // mivend.issue.88 follow-up: Integration Service's `department` deletion tombstones never
    // carry a name (confirmed against real staging-integration payloads, same shape as
    // organization/warehouse) — lets a caller update isActive on an already-known department
    // without fabricating a name. Deliberate no-op (returns false) when no Department matches
    // erpId yet.
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
