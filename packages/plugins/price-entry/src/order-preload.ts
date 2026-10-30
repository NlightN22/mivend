import {
    Order,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    translateEntity,
} from '@vendure/core';
import { In } from 'typeorm';

import { DiscountRule } from './discount-rule.entity';
import { VariantFacetValue } from './discount-rule.service';
import { LookupMemo, memoized } from './lookup-memo';
import { PriceEntryService } from './price-entry.service';

interface VariantFacetValueWithName extends VariantFacetValue {
    name: string;
}

export interface VariantFacetsAndWeight {
    facetValues: VariantFacetValueWithName[];
    weight: number;
}

// erp-import assigns facet values at the Product level, not the variant, so both levels are loaded.
export const VARIANT_FACET_RELATIONS = [
    'facetValues',
    'facetValues.facet',
    'facetValues.translations',
    'product',
    'product.facetValues',
    'product.facetValues.facet',
    'product.facetValues.translations',
    'product.customFields.manufacturer',
];

export const MANUFACTURER_FACET_CODE = 'manufacturer';

interface ProductManufacturerRef {
    externalId: string;
    name: string | null;
}

export function toFacetsAndWeight(
    ctx: RequestContext,
    variant: ProductVariant,
): VariantFacetsAndWeight {
    const all = [...variant.facetValues, ...(variant.product?.facetValues ?? [])];
    const facetValues: VariantFacetValueWithName[] = all.map(fv => ({
        facetCode: fv.facet.code,
        valueCode: fv.code,
        name: translateEntity(fv, ctx.languageCode).name,
    }));
    // The brand is a product relation, not a facet; a synthetic entry lets "manufacturer" rules match by ERP id.
    const manufacturer = (
        variant.product?.customFields as unknown as { manufacturer?: ProductManufacturerRef | null }
    )?.manufacturer;
    if (manufacturer?.externalId) {
        facetValues.push({
            facetCode: MANUFACTURER_FACET_CODE,
            valueCode: manufacturer.externalId,
            name: manufacturer.name ?? manufacturer.externalId,
        });
    }
    return {
        facetValues,
        weight: variant.customFields.weight ?? 0,
    };
}

// Seeds the memo with one query per kind for the whole order, so the per-line pass finds every lookup cached.
export async function preloadOrderLookups(
    connection: TransactionalConnection,
    priceEntryService: PriceEntryService,
    ctx: RequestContext,
    order: Order,
    memo: LookupMemo,
    resolveDefaultCode: (customerId: string) => Promise<string | null>,
): Promise<void> {
    const variantIds = [...new Set(order.lines.map(l => String(l.productVariantId)))];
    if (variantIds.length === 0) return;

    const variants = await connection.getRepository(ctx, ProductVariant).find({
        where: { id: In(variantIds) },
        relations: VARIANT_FACET_RELATIONS,
    });
    const erpIds = new Set<string>();
    for (const variant of variants) {
        const id = String(variant.id);
        const erpId = variant.product?.customFields?.externalId ?? '';
        memo.set(`fw:${id}`, toFacetsAndWeight(ctx, variant));
        memo.set(`erp:${id}`, erpId);
        if (erpId) erpIds.add(erpId);
    }

    if (erpIds.size > 0) {
        const now = new Date();
        const rules = await connection
            .getRepository(ctx, DiscountRule)
            .createQueryBuilder('dr')
            .where(
                '(dr.triggerProductErpId IN (:...erpIds) OR dr.giftProductErpId IN (:...erpIds))',
                {
                    erpIds: [...erpIds],
                },
            )
            // NULL validTo (open-ended promo) never matches: such a rule is not applied
            .andWhere('dr.validFrom <= :now AND dr.validTo >= :now', { now })
            .getMany();
        for (const erpId of erpIds) {
            memo.set(
                `promo:${erpId}`,
                rules.filter(r => r.triggerProductErpId === erpId || r.giftProductErpId === erpId),
            );
        }
    }

    if (order.customerId) {
        const customerId = String(order.customerId);
        const code = await memoized(memo, `ptc:${customerId}`, () =>
            priceEntryService.getPriceTypeCodeForCustomer(ctx, customerId),
        );
        let missing = variantIds;
        if (code) {
            const prices = await priceEntryService.getForVariants(ctx, variantIds, code);
            for (const id of variantIds) memo.set(`price:${id}:${code}`, prices.get(id) ?? null);
            missing = variantIds.filter(id => prices.get(id) == null);
        }
        const defaultCode = missing.length > 0 ? await resolveDefaultCode(customerId) : null;
        if (defaultCode && defaultCode !== code) {
            const prices = await priceEntryService.getForVariants(ctx, missing, defaultCode);
            for (const id of missing)
                memo.set(`price:${id}:${defaultCode}`, prices.get(id) ?? null);
        }
    }
}
