import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { DiscountRule, DiscountRuleOperationKind } from './discount-rule.entity';
import { LookupMemo, memoized } from './lookup-memo';

// Issue #107 — see DiscountRuleService.upsertPromoRule.
export interface PromoDiscountRuleInput {
    erpId: string;
    percent: number;
    validFrom: Date;
    validTo: Date | null;
    triggerProductErpId: string;
    triggerQuantity: number;
    giftProductErpId: string | null;
    giftQuantity: number | null;
    operationKind: DiscountRuleOperationKind;
}

// Promo rules differ in shape (no priceTypeCode/facetCode); keep them out of DiscountRuleService.
// Never sync into the priceType-scoped registry: DiscountRegistryEntry.priceTypeCode is required.
@Injectable()
export class PromoDiscountRuleService {
    constructor(private connection: TransactionalConnection) {}

    async upsertPromoRule(
        ctx: RequestContext,
        input: PromoDiscountRuleInput,
    ): Promise<DiscountRule> {
        const repo = this.connection.getRepository(ctx, DiscountRule);
        let record = await repo.findOne({ where: { erpId: input.erpId } });
        const values: Partial<DiscountRule> = {
            erpId: input.erpId,
            priceTypeCode: null,
            facetCode: null,
            facetValueCode: null,
            minWeightKg: null,
            minAmount: null,
            percent: input.percent,
            validFrom: input.validFrom,
            validTo: input.validTo,
            triggerProductErpId: input.triggerProductErpId,
            triggerQuantity: input.triggerQuantity,
            giftProductErpId: input.giftProductErpId,
            giftQuantity: input.giftQuantity,
            operationKind: input.operationKind,
        };
        if (record) {
            Object.assign(record, values);
        } else {
            record = repo.create(values);
        }
        return repo.save(record);
    }

    // Returns null without order context: promo rules can't be evaluated without the order's lines.
    // No priceTypeCode filter: promo rules apply regardless of the customer's price type.
    async getBestPromoPercent(
        ctx: RequestContext,
        productErpId: string,
        now: Date,
        quantityInOrderByProductErpId: Map<string, number>,
        memo?: LookupMemo,
    ): Promise<number | null> {
        if (quantityInOrderByProductErpId.size === 0) return null;
        const rules = await memoized(memo, `promo:${productErpId}`, () =>
            this.connection
                .getRepository(ctx, DiscountRule)
                .createQueryBuilder('dr')
                .where(
                    '(dr.triggerProductErpId = :productErpId OR dr.giftProductErpId = :productErpId)',
                    { productErpId },
                )
                // NULL validTo (open-ended promo) never matches: such a rule is not applied
                .andWhere('dr.validFrom <= :now AND dr.validTo >= :now', { now })
                .getMany(),
        );

        const matching = rules.filter(rule => {
            const triggerQty =
                quantityInOrderByProductErpId.get(rule.triggerProductErpId ?? '') ?? 0;
            if (triggerQty < (rule.triggerQuantity ?? 0)) return false;
            if (rule.giftProductErpId) {
                // Gift-type: this rule discounts productErpId only when productErpId IS the gift.
                return rule.giftProductErpId === productErpId;
            }
            // Percent-type: this rule discounts productErpId only when productErpId IS the
            // trigger product itself.
            return rule.triggerProductErpId === productErpId;
        });

        if (matching.length === 0) return null;
        return Math.max(...matching.map(r => r.percent));
    }
}
