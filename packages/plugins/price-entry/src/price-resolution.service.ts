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
        const weightByFacet = orderContext
            ? await this.buildWeightByFacet(ctx, variantId, facetValues, weight, orderContext)
            : new Map<string, number>();

        const percent = await this.discountRuleService.getBestPercent(
            ctx,
            priceTypeCode,
            facetValues,
            new Date(),
            weightByFacet,
        );

        if (percent === null) return { customerPrice: basePrice, compareAtPrice: null };
        return {
            customerPrice: Math.round(basePrice * (1 - percent / 100)),
            compareAtPrice: basePrice,
        };
    }

    private async buildWeightByFacet(
        ctx: RequestContext,
        variantId: string,
        thisFacetValues: VariantFacetValue[],
        thisWeight: number,
        orderContext: OrderPricingContext,
    ): Promise<Map<string, number>> {
        const weightByFacet = new Map<string, number>();
        const addContribution = (
            facetValues: VariantFacetValue[],
            contributionKg: number,
        ): void => {
            for (const fv of facetValues) {
                const key = facetKey(fv.facetCode, fv.valueCode);
                weightByFacet.set(key, (weightByFacet.get(key) ?? 0) + contributionKg);
            }
        };

        // orderContext.quantity is the final quantity for this line (Vendure passes the
        // post-change value for both addItemToOrder and adjustOrderLine) — skip this
        // variant's own existing line below to avoid double-counting on adjustOrderLine.
        addContribution(thisFacetValues, thisWeight * orderContext.quantity);

        for (const line of orderContext.order.lines) {
            if (String(line.productVariantId) === variantId) continue;
            const { facetValues, weight } = await this.getVariantFacetsAndWeight(
                ctx,
                String(line.productVariantId),
            );
            addContribution(facetValues, weight * line.quantity);
        }

        return weightByFacet;
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
