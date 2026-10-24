import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { DiscountRuleService } from './discount-rule.service';
import { LookupMemo } from './lookup-memo';
import { buildAggregates, facetKey } from './order-aggregates';
import { PriceEntryService } from './price-entry.service';
import { OrderPricingContext, PriceResolutionService } from './price-resolution.service';

export interface TierProgressVM {
    facetName: string;
    metric: 'WEIGHT' | 'AMOUNT';
    current: number;
    currentPercent: number | null;
    nextThreshold: number | null;
    nextPercent: number | null;
}

@Injectable()
export class TierProgressService {
    constructor(
        private priceEntryService: PriceEntryService,
        private discountRuleService: DiscountRuleService,
        private priceResolutionService: PriceResolutionService,
    ) {}

    // Uses the same aggregates resolve() computes for pricing, so progress matches the applied tier.
    async resolveTierProgress(
        ctx: RequestContext,
        variantId: string,
        orderContext: OrderPricingContext,
        memo?: LookupMemo,
    ): Promise<TierProgressVM | null> {
        const priceTypeCode = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (!priceTypeCode) return null;

        const basePrice = await this.priceResolutionService.forVariant(
            ctx,
            variantId,
            priceTypeCode,
            memo,
        );
        if (basePrice === null) return null;

        const { facetValues, weight } = await this.priceResolutionService.getVariantFacetsAndWeight(
            ctx,
            variantId,
            memo,
        );
        const tiers = await this.discountRuleService.getTiers(
            ctx,
            priceTypeCode,
            facetValues,
            new Date(),
        );
        if (tiers.length === 0) return null;

        const { weightByFacet, amountByFacet } = await buildAggregates(
            this.priceResolutionService,
            ctx,
            variantId,
            facetValues,
            weight,
            basePrice,
            priceTypeCode,
            orderContext,
            memo,
        );

        // A ladder is always scoped to one facetCode+facetValueCode (see docs/pricing.md) —
        // all tiers here share the same facet, so the first one identifies it.
        const { facetCode, facetValueCode } = tiers[0];
        const metric: 'WEIGHT' | 'AMOUNT' = tiers[0].minWeightKg !== null ? 'WEIGHT' : 'AMOUNT';
        const facetValue = facetValues.find(
            fv => fv.facetCode === facetCode && fv.valueCode === facetValueCode,
        );
        if (!facetValue) return null;
        const key = facetKey(facetCode, facetValueCode);
        const current =
            metric === 'WEIGHT' ? (weightByFacet.get(key) ?? 0) : (amountByFacet.get(key) ?? 0);

        const reached = tiers.filter(
            t => (metric === 'WEIGHT' ? t.minWeightKg : t.minAmount)! <= current,
        );
        const unreached = tiers.filter(
            t => (metric === 'WEIGHT' ? t.minWeightKg : t.minAmount)! > current,
        );
        const currentPercent = reached.length > 0 ? Math.max(...reached.map(t => t.percent)) : null;
        const next = unreached[0] ?? null;

        return {
            facetName: facetValue.name,
            metric,
            current,
            currentPercent,
            nextThreshold: next ? (metric === 'WEIGHT' ? next.minWeightKg : next.minAmount) : null,
            nextPercent: next ? next.percent : null,
        };
    }
}
