import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import {
    GlobalSettingsService,
    Logger,
    ProcessContext,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { BranchSettingsService } from './branch-settings.service';
import { Branch } from './entities/branch.entity';
import { BranchSettings } from './entities/branch-settings.entity';
import { ACCESS_CONTROL_PLUGIN_OPTIONS, AccessControlPluginOptions, loggerCtx } from './types';

const BOOTSTRAP_ERP_ID_PREFIX = 'mivend-bootstrap:';

// Issue #161: contours fed only by real Kafka data are never seeded, so the guest price fallback
// (#70) needs the default branch and its price type to exist without manual admin setup.
@Injectable()
export class DefaultBranchBootstrapService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private globalSettingsService: GlobalSettingsService,
        private branchSettingsService: BranchSettingsService,
        private processContext: ProcessContext,
        private customerPricingService: CustomerPricingService,
        @Inject(ACCESS_CONTROL_PLUGIN_OPTIONS) private options: AccessControlPluginOptions,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const names = this.options.branchNames ?? [];
        if (this.processContext.isWorker || names.length === 0) return;
        try {
            const ctx = RequestContext.empty();
            const branchIds = await this.ensureBranches(ctx, names);
            const defaultBranchId = await this.ensureDefaultBranch(ctx, branchIds[0]);
            await this.ensureBranchSettings(ctx, defaultBranchId);
        } catch (err) {
            Logger.error(
                `Default branch bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
                loggerCtx,
            );
        }
    }

    private async ensureBranches(ctx: RequestContext, names: string[]): Promise<string[]> {
        const repo = this.connection.getRepository(ctx, Branch);
        const ids: string[] = [];
        for (const name of names) {
            const erpId = `${BOOTSTRAP_ERP_ID_PREFIX}${name}`;
            const branch =
                (await repo.findOne({ where: { erpId } })) ??
                (await repo.save(repo.create({ erpId, name })));
            ids.push(String(branch.id));
        }
        return ids;
    }

    private async ensureDefaultBranch(ctx: RequestContext, firstBranchId: string): Promise<string> {
        const existing = await this.branchSettingsService.getGlobalDefaultBranchId(ctx);
        if (existing) return existing;
        await this.globalSettingsService.updateSettings(ctx, {
            customFields: { defaultBranchId: firstBranchId },
        });
        Logger.info(`Set default branch id=${firstBranchId}`, loggerCtx);
        return firstBranchId;
    }

    private async ensureBranchSettings(ctx: RequestContext, branchId: string): Promise<void> {
        const code = this.options.defaultPriceTypeCode;
        if (!code) return;
        const repo = this.connection.getRepository(ctx, BranchSettings);
        if (await repo.findOne({ where: { branchId } })) return;

        const priceType = await this.customerPricingService.findPriceTypeByCode(ctx, code);
        if (!priceType) {
            Logger.warn(
                `Default price type "${code}" not found, no default price set; restart after price types sync`,
                loggerCtx,
            );
            return;
        }
        await repo.save(
            repo.create({
                branchId,
                defaultPriceTypeId: String(priceType.id),
                defaultWarehouseId: null,
            }),
        );
        Logger.info(
            `Created BranchSettings for branchId=${branchId} (price type "${code}")`,
            loggerCtx,
        );
    }
}
