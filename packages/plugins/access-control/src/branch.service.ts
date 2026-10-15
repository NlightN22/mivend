import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { Branch } from './entities/branch.entity';
import { loggerCtx } from './types';

// Keeps mivend-created Branch ids distinct from ERP erpIds, which are always unprefixed GUIDs.
const MANUAL_ERP_ID_PREFIX = 'mivend-manual:';

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

    // Kafka-only contours never run erp-import's REST sync, leaving Branch empty and the picker blocked.
    // Warehouse->branch grouping ignores ERP org units, so staff must define branches without ERP data.
    async createManual(ctx: RequestContext, name: string): Promise<Branch> {
        const repo = this.connection.getRepository(ctx, Branch);
        const branch = repo.create({ erpId: `${MANUAL_ERP_ID_PREFIX}${randomUUID()}`, name });
        const saved = await repo.save(branch);
        Logger.verbose(`Created manual branch "${name}" (id=${saved.id})`, loggerCtx);
        return saved;
    }
}
