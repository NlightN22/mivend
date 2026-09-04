import { Injectable } from '@nestjs/common';
import {
    GlobalSettingsService,
    Logger,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { BranchSettings } from './entities/branch-settings.entity';
import { loggerCtx } from './types';

export interface BranchSettingsInput {
    branchId: string;
    defaultPriceTypeId: string;
    visiblePriceTypeIds?: string[] | null;
    defaultWarehouseId: string;
    visibleWarehouseIds?: string[] | null;
}

// CRUD + fallback resolution for issue #66's per-branch business settings. Never a source of
// RBAC scope (that stays AccessScopeService's job) — this is business configuration only.
@Injectable()
export class BranchSettingsService {
    constructor(
        private connection: TransactionalConnection,
        private globalSettingsService: GlobalSettingsService,
    ) {}

    async getForBranch(ctx: RequestContext, branchId: string): Promise<BranchSettings | null> {
        return this.connection.getRepository(ctx, BranchSettings).findOne({ where: { branchId } });
    }

    async upsert(ctx: RequestContext, input: BranchSettingsInput): Promise<BranchSettings> {
        const repo = this.connection.getRepository(ctx, BranchSettings);
        let settings = await repo.findOne({ where: { branchId: input.branchId } });
        if (settings) {
            settings.defaultPriceTypeId = input.defaultPriceTypeId;
            settings.visiblePriceTypeIds = input.visiblePriceTypeIds ?? null;
            settings.defaultWarehouseId = input.defaultWarehouseId;
            settings.visibleWarehouseIds = input.visibleWarehouseIds ?? null;
        } else {
            settings = repo.create({
                branchId: input.branchId,
                defaultPriceTypeId: input.defaultPriceTypeId,
                visiblePriceTypeIds: input.visiblePriceTypeIds ?? null,
                defaultWarehouseId: input.defaultWarehouseId,
                visibleWarehouseIds: input.visibleWarehouseIds ?? null,
            });
        }
        const saved = await repo.save(settings);
        Logger.verbose(`Upserted BranchSettings for branchId=${input.branchId}`, loggerCtx);
        return saved;
    }

    // Fallback per issue #66: a counterparty/manager with no branchId (or a branchId with no
    // BranchSettings configured yet) resolves to the global default Branch's settings, never a
    // hard error — the "graceful empty-system bootstrap" acceptance criterion. Returns null only
    // when neither the requested branch nor the global default branch has settings configured
    // yet (a genuinely empty, pre-bootstrap system) — callers must degrade gracefully (no price,
    // ATP 0), never fabricate a value.
    async resolveEffective(
        ctx: RequestContext,
        branchId?: string | null,
    ): Promise<BranchSettings | null> {
        if (branchId) {
            const direct = await this.getForBranch(ctx, branchId);
            if (direct) {
                return direct;
            }
        }
        const globalDefaultBranchId = await this.getGlobalDefaultBranchId(ctx);
        if (!globalDefaultBranchId) {
            return null;
        }
        return this.getForBranch(ctx, globalDefaultBranchId);
    }

    async getGlobalDefaultBranchId(ctx: RequestContext): Promise<string | null> {
        const settings = await this.globalSettingsService.getSettings(ctx);
        const customFields = settings.customFields as
            | { defaultBranchId?: string | null }
            | undefined;
        return customFields?.defaultBranchId ?? null;
    }
}
