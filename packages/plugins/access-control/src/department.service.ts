import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { Department } from './entities/department.entity';
import { loggerCtx } from './types';

export interface DepartmentRecordInput {
    erpId: string;
    name: string;
    parentErpId?: string | null;
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
        } else {
            department = repo.create({
                erpId: record.erpId,
                name: record.name,
                parentErpId: record.parentErpId ?? null,
            });
        }
        const saved = await repo.save(department);
        Logger.verbose(`Upserted department erpId=${record.erpId}`, loggerCtx);
        return saved;
    }

    async findAll(ctx: RequestContext): Promise<Department[]> {
        return this.connection.getRepository(ctx, Department).find({ order: { name: 'ASC' } });
    }
}
