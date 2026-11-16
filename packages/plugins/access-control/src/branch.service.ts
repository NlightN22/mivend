import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
    GlobalSettingsService,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { findBounded, withAggregateLock } from 'shared';

import { BranchSettingsService } from './branch-settings.service';
import { Branch } from './entities/branch.entity';
import { loggerCtx } from './types';

// Keeps mivend-created Branch ids distinct from ERP erpIds, which are always unprefixed GUIDs.
const MANUAL_ERP_ID_PREFIX = 'mivend-manual:';
const BRANCH_NAME_LOCK = 'branch-name';

export interface BranchRecordInput {
    erpId: string;
    name: string;
}

@Injectable()
export class BranchService {
    constructor(
        private connection: TransactionalConnection,
        private globalSettingsService: GlobalSettingsService,
        private branchSettingsService: BranchSettingsService,
    ) {}

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
        return findBounded(this.connection.getRepository(ctx, Branch), {
            order: { name: 'ASC' },
        });
    }

    // Kafka-only contours never run erp-import's REST sync, leaving Branch empty and the picker blocked.
    // Warehouse->branch grouping ignores ERP org units, so staff must define branches without ERP data.
    async createManual(ctx: RequestContext, name: string): Promise<Branch> {
        return this.withFreeName(ctx, name, null, async (txCtx, trimmed) => {
            const repo = this.connection.getRepository(txCtx, Branch);
            const branch = repo.create({
                erpId: `${MANUAL_ERP_ID_PREFIX}${randomUUID()}`,
                name: trimmed,
            });
            const saved = await repo.save(branch);
            Logger.verbose(`Created manual branch "${trimmed}" (id=${saved.id})`, loggerCtx);
            return saved;
        });
    }

    // The erpId never changes, so bootstrap and ERP sync keep finding the same row under the old key.
    async rename(ctx: RequestContext, branchId: string, name: string): Promise<Branch> {
        return this.withFreeName(ctx, name, branchId, async (txCtx, trimmed) => {
            const repo = this.connection.getRepository(txCtx, Branch);
            const branch = await repo.findOne({ where: { id: branchId } });
            if (!branch) throw new UserInputError(`Branch ${branchId} not found`);
            branch.name = trimmed;
            const saved = await repo.save(branch);
            Logger.verbose(`Renamed branch id=${branchId} to "${trimmed}"`, loggerCtx);
            return saved;
        });
    }

    async setDefault(ctx: RequestContext, branchId: string): Promise<Branch> {
        const branch = await this.connection
            .getRepository(ctx, Branch)
            .findOne({ where: { id: branchId } });
        if (!branch) throw new UserInputError(`Branch ${branchId} not found`);
        await this.globalSettingsService.updateSettings(ctx, {
            customFields: { defaultBranchId: String(branch.id) },
        });
        Logger.info(`Default branch set to id=${branch.id}`, loggerCtx);
        return branch;
    }

    async isDefault(ctx: RequestContext, branchId: string | number): Promise<boolean> {
        const defaultId = await this.branchSettingsService.getGlobalDefaultBranchId(ctx);
        return defaultId !== null && defaultId === String(branchId);
    }

    private async withFreeName<T>(
        ctx: RequestContext,
        name: string,
        exceptBranchId: string | null,
        work: (txCtx: RequestContext, trimmed: string) => Promise<T>,
    ): Promise<T> {
        const trimmed = name.trim();
        if (!trimmed) throw new UserInputError('Branch name must not be empty');
        return withAggregateLock(this.connection, ctx, BRANCH_NAME_LOCK, async txCtx => {
            const all = await findBounded(this.connection.getRepository(txCtx, Branch), {});
            const taken = all.some(
                b =>
                    String(b.id) !== exceptBranchId &&
                    b.name.toLowerCase() === trimmed.toLowerCase(),
            );
            if (taken) throw new UserInputError(`A branch named "${trimmed}" already exists`);
            return work(txCtx, trimmed);
        });
    }
}
