import { Injectable } from '@nestjs/common';
import { ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';

import { PriceEntryService } from './price-entry.service';
import { DiscountRuleService, VariantFacetValue } from './discount-rule.service';

export interface ResolvedPrice {
    customerPrice: number | null;
    compareAtPrice: number | null;
}

@Injectable()
export class PriceResolutionService {
    constructor(
        private priceEntryService: PriceEntryService,
        private discountRuleService: DiscountRuleService,
        private connection: TransactionalConnection,
    ) {}

    async resolve(ctx: RequestContext, variantId: string): Promise<ResolvedPrice> {
        const priceTypeCode = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (!priceTypeCode) return { customerPrice: null, compareAtPrice: null };

        const basePrice = await this.priceEntryService.getForVariant(ctx, variantId, priceTypeCode);
        if (basePrice === null) return { customerPrice: null, compareAtPrice: null };

        const facetValues = await this.getVariantFacetValues(ctx, variantId);
        const percent = await this.discountRuleService.getBestDiscountPercent(
            ctx,
            priceTypeCode,
            facetValues,
            new Date(),
        );

        if (percent === null) return { customerPrice: basePrice, compareAtPrice: null };
        return {
            customerPrice: Math.round(basePrice * (1 - percent / 100)),
            compareAtPrice: basePrice,
        };
    }

    private async getVariantFacetValues(
        ctx: RequestContext,
        variantId: string,
    ): Promise<VariantFacetValue[]> {
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
        if (!variant) return [];
        const all = [...variant.facetValues, ...(variant.product?.facetValues ?? [])];
        return all.map(fv => ({ facetCode: fv.facet.code, valueCode: fv.code }));
    }
}
