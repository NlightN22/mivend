import { Injectable } from '@nestjs/common';
import {
    Order,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    translateEntity,
} from '@vendure/core';

import { PriceEntryService } from './price-entry.service';
import { DiscountRuleService, DiscountTierVM, VariantFacetValue } from './discount-rule.service';
import './types';

export interface ResolvedPrice {
    customerPrice: number | null;
    compareAtPrice: number | null;
}

export interface OrderPricingContext {
    order: Order;
    quantity: number;
}

export interface TierProgressVM {
    facetName: string;
    metric: 'WEIGHT' | 'AMOUNT';
    current: number;
    currentPercent: number | null;
    nextThreshold: number | null;
    nextPercent: number | null;
}

interface FacetAggregates {
    weightByFacet: Map<string, number>;
    amountByFacet: Map<string, number>;
}

interface VariantFacetValueWithName extends VariantFacetValue {
    name: string;
}

interface VariantFacetsAndWeight {
    facetValues: VariantFacetValueWithName[];
    weight: number;
}

function facetKey(facetCode: string, valueCode: string): string {
    return `${facetCode}:${valueCode}`;
}

@Injectable()
export class PriceResolutionService {
    constructor(
        private priceEntryService: PriceEntryService,
        private discountRuleService: DiscountRuleService,
        private connection: TransactionalConnection,
    ) {}

    async resolve(
        ctx: RequestContext,
        variantId: string,
        orderContext?: OrderPricingContext,
    ): Promise<ResolvedPrice> {
        // When pricing a line on a real order, the order's own customer is authoritative — not
        // the caller. This is what makes admin-created orders (manager portal /orders/new) price
        // at the selected customer's rate instead of falling back to list price: ctx.activeUserId
        // there is the administrator, who has no customer_price_type row of their own.
        const priceTypeCode = orderContext?.order.customerId
            ? await this.priceEntryService.getPriceTypeCodeForCustomer(
                  ctx,
                  String(orderContext.order.customerId),
              )
            : await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (!priceTypeCode) return { customerPrice: null, compareAtPrice: null };

        const basePrice = await this.priceEntryService.getForVariant(ctx, variantId, priceTypeCode);
        if (basePrice === null) return { customerPrice: null, compareAtPrice: null };

        const { facetValues, weight } = await this.getVariantFacetsAndWeight(ctx, variantId);
        const { weightByFacet, amountByFacet } = orderContext
            ? await this.buildAggregates(
                  ctx,
                  variantId,
                  facetValues,
                  weight,
                  basePrice,
                  priceTypeCode,
                  orderContext,
              )
            : {
                  weightByFacet: new Map<string, number>(),
                  amountByFacet: new Map<string, number>(),
              };

        const percent = await this.discountRuleService.getBestPercent(
            ctx,
            priceTypeCode,
            facetValues,
            new Date(),
            weightByFacet,
            amountByFacet,
        );

        if (percent === null) return { customerPrice: basePrice, compareAtPrice: null };
        return {
            customerPrice: Math.round(basePrice * (1 - percent / 100)),
            compareAtPrice: basePrice,
        };
    }

    /**
     * Sums, per facet value, both the weight (kg) and the spend (base price × quantity)
     * across the variant being priced and every other line already in the order that
     * shares a facet value with it. Skips the priced variant's own pre-existing line to
     * avoid double-counting on `adjustOrderLine`, where `orderContext.quantity` is
     * already the final post-change quantity.
     */
    private async buildAggregates(
        ctx: RequestContext,
        variantId: string,
        thisFacetValues: VariantFacetValue[],
        thisWeight: number,
        thisBasePrice: number,
        priceTypeCode: string,
        orderContext: OrderPricingContext,
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

        // orderContext.quantity is the final quantity for this line (Vendure passes the
        // post-change value for both addItemToOrder and adjustOrderLine) — skip this
        // variant's own existing line below to avoid double-counting on adjustOrderLine.
        addContribution(
            thisFacetValues,
            thisWeight * orderContext.quantity,
            thisBasePrice * orderContext.quantity,
        );

        for (const line of orderContext.order.lines) {
            const lineVariantId = String(line.productVariantId);
            if (lineVariantId === variantId) continue;
            const [{ facetValues, weight }, price] = await Promise.all([
                this.getVariantFacetsAndWeight(ctx, lineVariantId),
                this.priceEntryService.getForVariant(ctx, lineVariantId, priceTypeCode),
            ]);
            addContribution(facetValues, weight * line.quantity, (price ?? 0) * line.quantity);
        }

        return { weightByFacet, amountByFacet };
    }

    private async getVariantFacetsAndWeight(
        ctx: RequestContext,
        variantId: string,
    ): Promise<VariantFacetsAndWeight> {
        // Facet values (e.g. brand) are assigned at the Product level by erp-import,
        // not the variant — merge both so a rule matches regardless of which level
        // the facet was actually assigned to.
        const variant = await this.connection.getRepository(ctx, ProductVariant).findOne({
            where: { id: variantId },
            relations: [
                'facetValues',
                'facetValues.facet',
                'facetValues.translations',
                'product',
                'product.facetValues',
                'product.facetValues.facet',
                'product.facetValues.translations',
            ],
        });
        if (!variant) return { facetValues: [], weight: 0 };
        const all = [...variant.facetValues, ...(variant.product?.facetValues ?? [])];
        return {
            facetValues: all.map(fv => {
                const translated = translateEntity(fv, ctx.languageCode);
                return { facetCode: fv.facet.code, valueCode: fv.code, name: translated.name };
            }),
            weight: variant.customFields.weight ?? 0,
        };
    }

    /**
     * Ladder rungs available for a variant's facets — no order context, for catalog
     * display. Informational only; never implies a price the customer hasn't earned.
     */
    async resolveTiers(ctx: RequestContext, variantId: string): Promise<DiscountTierVM[]> {
        const priceTypeCode = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (!priceTypeCode) return [];
        // No PriceEntry for this variant+priceType means there is no base price to ever
        // discount from — showing a tier ladder badge would be pure noise/misleading.
        const basePrice = await this.priceEntryService.getForVariant(ctx, variantId, priceTypeCode);
        if (basePrice === null) return [];
        const { facetValues } = await this.getVariantFacetsAndWeight(ctx, variantId);
        return this.discountRuleService.getTiers(ctx, priceTypeCode, facetValues, new Date());
    }

    /**
     * Progress toward the next unreached tier for a variant's facet, given the current
     * order context — reuses the same aggregates `resolve()` computes for pricing, just
     * exposes them instead of discarding them after `getBestPercent()`.
     */
    async resolveTierProgress(
        ctx: RequestContext,
        variantId: string,
        orderContext: OrderPricingContext,
    ): Promise<TierProgressVM | null> {
        const priceTypeCode = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (!priceTypeCode) return null;

        const basePrice = await this.priceEntryService.getForVariant(ctx, variantId, priceTypeCode);
        if (basePrice === null) return null;

        const { facetValues, weight } = await this.getVariantFacetsAndWeight(ctx, variantId);
        const tiers = await this.discountRuleService.getTiers(
            ctx,
            priceTypeCode,
            facetValues,
            new Date(),
        );
        if (tiers.length === 0) return null;

        const { weightByFacet, amountByFacet } = await this.buildAggregates(
            ctx,
            variantId,
            facetValues,
            weight,
            basePrice,
            priceTypeCode,
            orderContext,
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
