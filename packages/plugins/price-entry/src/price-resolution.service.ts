import { Injectable } from '@nestjs/common';
import {
    CustomerService,
    Order,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Counterparty, CounterpartyService } from '@mivend/plugin-counterparty';
import { BranchSettingsService } from '@mivend/plugin-access-control';

import { PriceEntryService } from './price-entry.service';
import { DiscountRuleService, DiscountTierVM } from './discount-rule.service';
import { PromoDiscountRuleService } from './promo-discount-rule.service';
import { CounterpartyDiscountRuleService } from './counterparty-discount-rule.service';
import { getProductErpId, buildProductErpQuantities } from './promo-product-lookup';
import { LookupMemo, memoized } from './lookup-memo';
import {
    VARIANT_FACET_RELATIONS,
    VariantFacetsAndWeight,
    preloadOrderLookups,
    toFacetsAndWeight,
} from './order-preload';
import { buildAggregates } from './order-aggregates';
import './types';

export interface ResolvedPrice {
    customerPrice: number | null;
    compareAtPrice: number | null;
}

export interface OrderPricingContext {
    order: Order;
    quantity: number;
    // Pre-promotion order total for the counterparty amount rules; defaults to the persisted order total.
    documentAmount?: number;
}

export interface ResolveOptions {
    // false: the order only identifies the customer; tier, promo and counterparty rules are skipped.
    orderRules?: boolean;
    // Shared across the lines of one order so sibling lookups run once per order, not once per line.
    memo?: LookupMemo;
}

@Injectable()
export class PriceResolutionService {
    constructor(
        private priceEntryService: PriceEntryService,
        private discountRuleService: DiscountRuleService,
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private counterpartyService: CounterpartyService,
        private branchSettingsService: BranchSettingsService,
        private promoDiscountRuleService: PromoDiscountRuleService,
        private counterpartyDiscountRuleService: CounterpartyDiscountRuleService,
    ) {}

    preload(ctx: RequestContext, order: Order, memo: LookupMemo): Promise<void> {
        return preloadOrderLookups(
            this.connection,
            this.priceEntryService,
            ctx,
            order,
            memo,
            async customerId => {
                const counterparty = await memoized(memo, `cp:${customerId}`, () =>
                    this.counterpartyService.getForCustomer(ctx, customerId),
                );
                const branchId = counterparty?.branchId ?? undefined;
                const branchSettings = await memoized(memo, `bs:${String(branchId)}`, () =>
                    this.branchSettingsService.resolveEffective(ctx, branchId),
                );
                return branchSettings
                    ? this.defaultCodeOf(ctx, branchSettings.defaultPriceTypeId, memo)
                    : null;
            },
        );
    }

    private defaultCodeOf(
        ctx: RequestContext,
        priceTypeId: string,
        memo?: LookupMemo,
    ): Promise<string | null> {
        return memoized(memo, `ptid:${priceTypeId}`, () =>
            this.priceEntryService.getPriceTypeCodeById(ctx, priceTypeId),
        );
    }

    async resolve(
        ctx: RequestContext,
        variantId: string,
        orderContext?: OrderPricingContext,
        options?: ResolveOptions,
    ): Promise<ResolvedPrice> {
        const ruleContext = options?.orderRules === false ? undefined : orderContext;
        // Order's customer, not the caller, sets the price type: admin-created orders have an admin
        // as activeUserId, who has no customer_price_type row.
        const memo = options?.memo;
        const priceTypeCode = orderContext?.order.customerId
            ? await memoized(memo, `ptc:${String(orderContext.order.customerId)}`, () =>
                  this.priceEntryService.getPriceTypeCodeForCustomer(
                      ctx,
                      String(orderContext.order.customerId),
                  ),
              )
            : await this.priceEntryService.getPriceTypeCodeForUser(ctx);

        // Customer-scoped grants must only discount their granted counterparties. order.customerId is
        // authoritative on real order lines, as for priceTypeCode.
        const counterparty = await this.resolveCounterparty(ctx, orderContext, memo);
        const counterpartyId = counterparty ? String(counterparty.id) : null;

        let basePrice: number | null = null;
        let effectivePriceTypeCode: string | null = null;
        let effectiveCounterpartyId: string | null = null;
        if (priceTypeCode) {
            basePrice = await this.forVariant(ctx, variantId, priceTypeCode, memo);
            if (basePrice !== null) {
                effectivePriceTypeCode = priceTypeCode;
                effectiveCounterpartyId = counterpartyId;
            }
        }

        // Fallback must be the branch default price type, never a raw search-index price or zero.
        // Only general discounts apply here, so effectiveCounterpartyId stays null.
        if (effectivePriceTypeCode === null) {
            const branchId = counterparty?.branchId ?? undefined;
            const branchSettings = await memoized(memo, `bs:${String(branchId)}`, () =>
                this.branchSettingsService.resolveEffective(ctx, branchId),
            );
            const defaultPriceTypeCode = branchSettings
                ? await this.defaultCodeOf(ctx, branchSettings.defaultPriceTypeId, memo)
                : null;
            if (defaultPriceTypeCode) {
                basePrice = await this.forVariant(ctx, variantId, defaultPriceTypeCode, memo);
                effectivePriceTypeCode = basePrice !== null ? defaultPriceTypeCode : null;
            }
        }

        if (basePrice === null || effectivePriceTypeCode === null) {
            return { customerPrice: null, compareAtPrice: null };
        }
        const priceTypeCodeForDiscount = effectivePriceTypeCode;

        const { facetValues, weight } = await this.getVariantFacetsAndWeight(ctx, variantId, memo);
        const { weightByFacet, amountByFacet } = ruleContext
            ? await buildAggregates(
                  this,
                  ctx,
                  variantId,
                  facetValues,
                  weight,
                  basePrice,
                  priceTypeCodeForDiscount,
                  ruleContext,
                  memo,
              )
            : {
                  weightByFacet: new Map<string, number>(),
                  amountByFacet: new Map<string, number>(),
              };

        const percent = await this.discountRuleService.getBestPercent(
            ctx,
            priceTypeCodeForDiscount,
            facetValues,
            new Date(),
            weightByFacet,
            amountByFacet,
            effectiveCounterpartyId,
            memo,
        );

        // Promo rules need real order context; with no line quantities no promo can qualify.
        // Counterparty-scoped rules share this requirement and the same product quantity map.
        const productErpQuantities = ruleContext
            ? await buildProductErpQuantities(
                  this.connection,
                  ctx,
                  variantId,
                  ruleContext.order,
                  ruleContext.quantity,
                  memo,
              )
            : null;
        const promoPercent = ruleContext
            ? await this.promoDiscountRuleService.getBestPromoPercent(
                  ctx,
                  await getProductErpId(this.connection, ctx, variantId, memo),
                  new Date(),
                  productErpQuantities!,
                  memo,
              )
            : null;
        // totalWithTax excludes this priced line's own contribution — accepted approximation, same as the tier ladder's aggregates.
        const counterpartyRulePercent = ruleContext
            ? await this.counterpartyDiscountRuleService.getBestPercent(
                  ctx,
                  ruleContext.order,
                  counterparty,
                  await getProductErpId(this.connection, ctx, variantId, memo),
                  productErpQuantities!,
                  ruleContext.documentAmount ?? ruleContext.order.totalWithTax,
                  new Date(),
                  memo,
              )
            : null;

        // Sources combine by max, never additively: discounts from different rules must not stack.
        const bestPercent = [percent, promoPercent, counterpartyRulePercent]
            .filter((p): p is number => p !== null)
            .reduce((max, p) => Math.max(max, p), -Infinity);

        if (bestPercent === -Infinity) return { customerPrice: basePrice, compareAtPrice: null };
        return {
            customerPrice: Math.round(basePrice * (1 - bestPercent / 100)),
            compareAtPrice: basePrice,
        };
    }

    // order.customerId wins on real order lines; activeUserId is used for catalog display.
    // Returns the full Counterparty so the fallback path reads branchId without a second lookup.
    private async resolveCounterparty(
        ctx: RequestContext,
        orderContext?: OrderPricingContext,
        memo?: LookupMemo,
    ): Promise<Counterparty | null> {
        let customerId: string | undefined;
        if (orderContext?.order.customerId) {
            customerId = String(orderContext.order.customerId);
        } else if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            customerId = customer ? String(customer.id) : undefined;
        }
        if (!customerId) return null;
        const id = customerId;
        return memoized(memo, `cp:${id}`, () => this.counterpartyService.getForCustomer(ctx, id));
    }

    forVariant(
        ctx: RequestContext,
        variantId: string,
        priceTypeCode: string,
        memo?: LookupMemo,
    ): Promise<number | null> {
        return memoized(memo, `price:${variantId}:${priceTypeCode}`, () =>
            this.priceEntryService.getForVariant(ctx, variantId, priceTypeCode),
        );
    }

    getVariantFacetsAndWeight(
        ctx: RequestContext,
        variantId: string,
        memo?: LookupMemo,
    ): Promise<VariantFacetsAndWeight> {
        return memoized(memo, `fw:${variantId}`, () => this.loadFacetsAndWeight(ctx, variantId));
    }

    private async loadFacetsAndWeight(
        ctx: RequestContext,
        variantId: string,
    ): Promise<VariantFacetsAndWeight> {
        const variant = await this.connection.getRepository(ctx, ProductVariant).findOne({
            where: { id: variantId },
            relations: VARIANT_FACET_RELATIONS,
        });
        return variant ? toFacetsAndWeight(ctx, variant) : { facetValues: [], weight: 0 };
    }

    // No order context here: rungs are informational and must not imply a price not yet earned.
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
}
