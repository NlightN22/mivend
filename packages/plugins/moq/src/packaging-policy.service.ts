import { Injectable } from '@nestjs/common';
import { ID, ProductVariant, RequestContext } from '@vendure/core';
import { BranchSettings, BranchSettingsService } from '@mivend/plugin-access-control';
import { TradingPointService } from '@mivend/plugin-counterparty';

import { wholePackQuantity } from './whole-pack';

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
        const settings = await this.resolveSettings(ctx, customerId, orderBranchId);
        return settings?.packagesOnly === true;
    }

    async isMultiplicityEnforced(
        ctx: RequestContext,
        customerId: ID | null | undefined,
        orderBranchId: string | null = null,
    ): Promise<boolean> {
        const settings = await this.resolveSettings(ctx, customerId, orderBranchId);
        return settings?.enforceMultiplicity === true;
    }

    // Quantity step a line must be a multiple of. The pack rule replaces multiplicity; null/0/negative
    // multiplicity is a data error and means no constraint (docs/order-flow.md).
    async requiredMultiple(
        ctx: RequestContext,
        variant: ProductVariant,
        customerId: ID | null | undefined,
        orderBranchId: string | null = null,
    ): Promise<number> {
        const multiplicity = variant.customFields?.multiplicity ?? 1;
        const ratio = variant.customFields?.unitRatioToBase ?? null;
        const hasRatio = !!ratio && ratio > 0 && ratio !== 1;
        if (!(multiplicity > 1) && !hasRatio) return 1;

        const settings = await this.resolveSettings(ctx, customerId, orderBranchId);
        if (hasRatio && settings?.packagesOnly === true) {
            const packQuantity = wholePackQuantity(ratio);
            if (packQuantity !== null) return packQuantity;
        }
        return settings?.enforceMultiplicity === true && multiplicity > 1 ? multiplicity : 1;
    }

    private async resolveSettings(
        ctx: RequestContext,
        customerId: ID | null | undefined,
        orderBranchId: string | null,
    ): Promise<BranchSettings | null> {
        const branchId = await this.resolveBranchId(ctx, customerId, orderBranchId);
        return this.branchSettingsService.resolveEffective(ctx, branchId);
    }
}
