import { RequestContext } from '@vendure/core';

import { VariantFacetValue } from './discount-rule.service';
import { LookupMemo } from './lookup-memo';
import { VariantFacetsAndWeight } from './order-preload';
import type { OrderPricingContext } from './price-resolution.service';

export interface FacetAggregates {
    weightByFacet: Map<string, number>;
    amountByFacet: Map<string, number>;
}

export interface VariantLookups {
    forVariant(
        ctx: RequestContext,
        variantId: string,
        priceTypeCode: string,
        memo?: LookupMemo,
    ): Promise<number | null>;
    getVariantFacetsAndWeight(
        ctx: RequestContext,
        variantId: string,
        memo?: LookupMemo,
    ): Promise<VariantFacetsAndWeight>;
}

export function facetKey(facetCode: string, valueCode: string): string {
    return `${facetCode}:${valueCode}`;
}

// Skips the variant's own existing line: on adjustOrderLine orderContext.quantity is already
// the post-change value, so counting that line too would double-count it.
export async function buildAggregates(
    lookups: VariantLookups,
    ctx: RequestContext,
    variantId: string,
    thisFacetValues: VariantFacetValue[],
    thisWeight: number,
    thisBasePrice: number,
    priceTypeCode: string,
    orderContext: OrderPricingContext,
    memo?: LookupMemo,
): Promise<FacetAggregates> {
    const weightByFacet = new Map<string, number>();
    const amountByFacet = new Map<string, number>();
    const addContribution = (
        facetValues: VariantFacetValue[],
        weightKg: number,
        amount: number,
    ): void => {
        for (const fv of facetValues) {
            const key = facetKey(fv.facetCode, fv.valueCode);
            weightByFacet.set(key, (weightByFacet.get(key) ?? 0) + weightKg);
            amountByFacet.set(key, (amountByFacet.get(key) ?? 0) + amount);
        }
    };

    // orderContext.quantity is already the post-change value for both addItemToOrder and adjustOrderLine.
    addContribution(
        thisFacetValues,
        thisWeight * orderContext.quantity,
        thisBasePrice * orderContext.quantity,
    );

    for (const line of orderContext.order.lines) {
        const lineVariantId = String(line.productVariantId);
        if (lineVariantId === variantId) continue;
        const [{ facetValues, weight }, price] = await Promise.all([
            lookups.getVariantFacetsAndWeight(ctx, lineVariantId, memo),
            lookups.forVariant(ctx, lineVariantId, priceTypeCode, memo),
        ]);
        addContribution(facetValues, weight * line.quantity, (price ?? 0) * line.quantity);
    }

    return { weightByFacet, amountByFacet };
}
