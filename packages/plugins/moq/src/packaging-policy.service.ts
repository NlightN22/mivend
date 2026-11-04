import { Injectable } from '@nestjs/common';
import { ID, ProductVariant, RequestContext } from '@vendure/core';
import { BranchSettings, BranchSettingsService } from '@mivend/plugin-access-control';
import { CheckPolicyService } from '@mivend/plugin-checks';
import { TradingPointService } from '@mivend/plugin-counterparty';

import { MULTIPLICITY_CHECK_CODE } from './multiplicity.check';
import { wholePackQuantity } from './whole-pack';

interface OrderScope {
    branchId: string | null;
    settings: BranchSettings | null;
}

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
        const steps = await this.requiredMultiples(
            ctx,
            [variant],
            customerId,
            orderBranchId,
            assumeEnforced,
        );
        return steps.get(String(variant.id)) ?? 1;
    }

    // Branch, settings and policy are the same for every line of one order: resolved once, lazily.
    async requiredMultiples(
        ctx: RequestContext,
        variants: ProductVariant[],
        customerId: ID | null | undefined,
        orderBranchId: string | null = null,
        assumeEnforced = false,
    ): Promise<Map<string, number>> {
        const steps = new Map<string, number>();
        let scope: Promise<OrderScope> | null = null;
        let enforcedPolicy: Promise<boolean> | null = null;
        for (const variant of variants) {
            const multiplicity = variant.customFields?.multiplicity ?? 1;
            const ratio = variant.customFields?.unitRatioToBase ?? null;
            const hasRatio = !!ratio && ratio > 0 && ratio !== 1;
            if (!(multiplicity > 1) && !hasRatio) {
                steps.set(String(variant.id), 1);
                continue;
            }
            scope ??= this.loadScope(ctx, customerId, orderBranchId);
            const { settings, branchId } = await scope;
            const packQuantity =
                hasRatio && settings?.packagesOnly === true ? wholePackQuantity(ratio) : null;
            if (packQuantity !== null) steps.set(String(variant.id), packQuantity);
            else if (!(multiplicity > 1)) steps.set(String(variant.id), 1);
            else {
                enforcedPolicy ??= this.isEnforcedFor(ctx, branchId);
                const enforced = assumeEnforced || (await enforcedPolicy);
                steps.set(String(variant.id), enforced ? multiplicity : 1);
            }
        }
        return steps;
    }

    private async loadScope(
        ctx: RequestContext,
        customerId: ID | null | undefined,
        orderBranchId: string | null,
    ): Promise<OrderScope> {
        const branchId = await this.resolveBranchId(ctx, customerId, orderBranchId);
        return {
            branchId,
            settings: await this.branchSettingsService.resolveEffective(ctx, branchId),
        };
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
