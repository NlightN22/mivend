import { Injectable } from '@nestjs/common';
import { ID, RequestContext } from '@vendure/core';
import { BranchSettingsService } from '@mivend/plugin-access-control';
import { TradingPointService } from '@mivend/plugin-counterparty';

// Whether the branch serving a customer sells variants with a package default unit only in packages (#214).
@Injectable()
export class PackagingPolicyService {
    constructor(
        private readonly branchSettingsService: BranchSettingsService,
        private readonly tradingPointService: TradingPointService,
    ) {}

    // order.customFields.branchId is unset until placement, so resolve from the preferred TradingPoint first.
    async resolveBranchId(
        ctx: RequestContext,
        customerId: ID | null | undefined,
        orderBranchId: string | null = null,
    ): Promise<string | null> {
        if (customerId) {
            const tradingPoint = await this.tradingPointService.getPreferredForCustomer(
                ctx,
                customerId,
            );
            const branchId = tradingPoint
                ? await this.tradingPointService.resolveServicingBranchId(ctx, tradingPoint)
                : null;
            if (branchId) return branchId;
        }
        return orderBranchId;
    }

    async isPackagesOnly(
        ctx: RequestContext,
        customerId: ID | null | undefined,
        orderBranchId: string | null = null,
    ): Promise<boolean> {
        const branchId = await this.resolveBranchId(ctx, customerId, orderBranchId);
        const settings = await this.branchSettingsService.resolveEffective(ctx, branchId);
        return settings?.packagesOnly === true;
    }
}
