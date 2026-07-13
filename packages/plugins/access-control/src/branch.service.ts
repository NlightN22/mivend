import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { Branch } from './entities/branch.entity';
import { loggerCtx } from './types';

export interface BranchRecordInput {
    erpId: string;
    name: string;
}

@Injectable()
export class BranchService {
    constructor(private connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: BranchRecordInput): Promise<Branch> {
        const repo = this.connection.getRepository(ctx, Branch);
        let branch = await repo.findOne({ where: { erpId: record.erpId } });
        if (branch) {
            branch.name = record.name;
        } else {
            branch = repo.create({ erpId: record.erpId, name: record.name });
        }
        const saved = await repo.save(branch);
        Logger.verbose(`Upserted branch erpId=${record.erpId}`, loggerCtx);
        return saved;
    }

    async findAll(ctx: RequestContext): Promise<Branch[]> {
        return this.connection.getRepository(ctx, Branch).find({ order: { name: 'ASC' } });
    }
}
