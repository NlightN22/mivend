import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { DiscountRule, DiscountRuleOperationKind } from './discount-rule.entity';

// Issue #107 — see DiscountRuleService.upsertPromoRule.
export interface PromoDiscountRuleInput {
    erpId: string;
    percent: number;
    validFrom: Date;
    validTo: Date;
    triggerProductErpId: string;
    triggerQuantity: number;
    giftProductErpId: string | null;
    giftQuantity: number | null;
    operationKind: DiscountRuleOperationKind;
}

// Issue #107: split out of DiscountRuleService to keep both files under AGENTS.md's 200-300 line
// limit — a promo rule (PromoRuleChanged) is a genuinely different write/read shape (trigger/gift
// columns, no priceTypeCode/facetCode) sharing only the DiscountRule table itself, not
// DiscountRuleService's facet/priceType-threshold query logic. Never syncs into the
// priceType-scoped /discounts registry (DiscountRegistryEntry.priceTypeCode is required and a
// promo rule has none — see DiscountRule's own doc comment for the two-shape invariant).
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

    // Percent applying to `productErpId`'s own line, triggered by that same product's quantity in
    // the order (percent-type promo rules), plus percent applying to `productErpId` as a gift
    // line, triggered by a *different* product's quantity elsewhere in the order (gift-type promo
    // rules). No priceTypeCode filter — promo rules apply regardless of the customer's price type.
    // Returns null with no order context (catalog display) — a promo rule can never be evaluated
    // without knowing what's actually in the order.
    async getBestPromoPercent(
        ctx: RequestContext,
        productErpId: string,
        now: Date,
        quantityInOrderByProductErpId: Map<string, number>,
    ): Promise<number | null> {
        if (quantityInOrderByProductErpId.size === 0) return null;
        const rules = await this.connection
            .getRepository(ctx, DiscountRule)
            .createQueryBuilder('dr')
            .where(
                '(dr.triggerProductErpId = :productErpId OR dr.giftProductErpId = :productErpId)',
                { productErpId },
            )
            .andWhere('dr.validFrom <= :now AND dr.validTo >= :now', { now })
            .getMany();

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
