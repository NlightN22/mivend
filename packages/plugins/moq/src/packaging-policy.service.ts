import { Injectable } from '@nestjs/common';
import { ID, ProductVariant, RequestContext } from '@vendure/core';
import { BranchSettings, BranchSettingsService } from '@mivend/plugin-access-control';
import { CheckPolicyService } from '@mivend/plugin-checks';
import { TradingPointService } from '@mivend/plugin-counterparty';

import { MULTIPLICITY_CHECK_CODE } from './multiplicity.check';
import { wholePackQuantity } from './whole-pack';

// Whether the branch serving a customer sells variants with a package default unit only in packages (#214).
@Injectable()
export class PackagingPolicyService {
    constructor(
        private readonly branchSettingsService: BranchSettingsService,
        private readonly tradingPointService: TradingPointService,
        private readonly checkPolicies: CheckPolicyService,
    ) {}

    // A placed order keeps its own branch; the preferred TradingPoint is only the pre-placement fallback.
    async resolveBranchId(
        ctx: RequestContext,
        customerId: ID | null | undefined,
        orderBranchId: string | null = null,
    ): Promise<string | null> {
        if (orderBranchId) return orderBranchId;
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
        return null;
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
        const branchId = await this.resolveBranchId(ctx, customerId, orderBranchId);
        return this.isEnforcedFor(ctx, branchId);
    }

    // Enforced means the check's `cart` policy of the branch is on and blocks (docs/checks-and-policies.md).
    private async isEnforcedFor(ctx: RequestContext, branchId: string | null): Promise<boolean> {
        const policy = await this.checkPolicies.resolve(
            ctx,
            MULTIPLICITY_CHECK_CODE,
            'cart',
            branchId,
        );
        return policy.enabled && policy.consequence === 'block';
    }

    // Quantity step a line must be a multiple of. The pack rule replaces multiplicity; null/0/negative
    // multiplicity is a data error and means no constraint (docs/order-flow.md).
    async requiredMultiple(
        ctx: RequestContext,
        variant: ProductVariant,
        customerId: ID | null | undefined,
        orderBranchId: string | null = null,
        // The multiplicity check passes `true`: it reports the declared rule whatever the cart policy is.
        assumeEnforced = false,
    ): Promise<number> {
        const multiplicity = variant.customFields?.multiplicity ?? 1;
        const ratio = variant.customFields?.unitRatioToBase ?? null;
        const hasRatio = !!ratio && ratio > 0 && ratio !== 1;
        if (!(multiplicity > 1) && !hasRatio) return 1;

        const branchId = await this.resolveBranchId(ctx, customerId, orderBranchId);
        const settings = await this.branchSettingsService.resolveEffective(ctx, branchId);
        if (hasRatio && settings?.packagesOnly === true) {
            const packQuantity = wholePackQuantity(ratio);
            if (packQuantity !== null) return packQuantity;
        }
        if (!(multiplicity > 1)) return 1;
        return assumeEnforced || (await this.isEnforcedFor(ctx, branchId)) ? multiplicity : 1;
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
