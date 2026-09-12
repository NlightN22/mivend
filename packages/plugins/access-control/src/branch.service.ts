import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { Branch } from './entities/branch.entity';
import { loggerCtx } from './types';

// Prefix distinguishes a mivend-created Branch from a real 1C GUID at a glance (e.g. in an
// admin list or a support query) — never collides with a real 1C erpId, which is always a plain
// GUID with no prefix.
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

    // Own-consolidation escape hatch (issue #80 follow-up): Branch has historically been
    // ERP-only master data (see the entity's own comment), populated via erp-import's
    // BranchRecord — but that REST sync has never run on Kafka-only contours, leaving Branch
    // permanently empty there and blocking WarehouseCurationTable's branch picker entirely.
    // mivend's own warehouse→branch grouping is deliberately independent of whatever org unit
    // 1C's Kafka streams represent (see WarehouseStreamHandler's own comment) — staff need to be
    // able to define their own branches without waiting on ERP data at all.
    async createManual(ctx: RequestContext, name: string): Promise<Branch> {
        const repo = this.connection.getRepository(ctx, Branch);
        const branch = repo.create({ erpId: `${MANUAL_ERP_ID_PREFIX}${randomUUID()}`, name });
        const saved = await repo.save(branch);
        Logger.verbose(`Created manual branch "${name}" (id=${saved.id})`, loggerCtx);
        return saved;
    }
}
