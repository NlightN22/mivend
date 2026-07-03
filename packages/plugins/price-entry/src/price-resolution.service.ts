import { Injectable } from '@nestjs/common';
import { Order, ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';

import { PriceEntryService } from './price-entry.service';
import { DiscountRuleService, VariantFacetValue } from './discount-rule.service';
import './types';

export interface ResolvedPrice {
    customerPrice: number | null;
    compareAtPrice: number | null;
}

export interface OrderPricingContext {
    order: Order;
    quantity: number;
}

interface FacetAggregates {
    weightByFacet: Map<string, number>;
    amountByFacet: Map<string, number>;
}

interface VariantFacetsAndWeight {
    facetValues: VariantFacetValue[];
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
        const priceTypeCode = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
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
                'product',
                'product.facetValues',
                'product.facetValues.facet',
            ],
        });
        if (!variant) return { facetValues: [], weight: 0 };
        const all = [...variant.facetValues, ...(variant.product?.facetValues ?? [])];
        return {
            facetValues: all.map(fv => ({ facetCode: fv.facet.code, valueCode: fv.code })),
            weight: variant.customFields.weight ?? 0,
        };
    }
}
