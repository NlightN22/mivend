import type { RetroBonusRule } from './retro-bonus-rule.entity';

export interface OrderRetroBonus {
    hasRules: boolean;
    lines: LineRetroBonus[];
}

export interface LineRetroBonus {
    orderLineId: string;
    percent: number;
    // Null when the rule has a threshold: the order alone does not say whether it is reached.
    amount: number | null;
}

type ApplicableRule = Pick<
    RetroBonusRule,
    | 'percent'
    | 'allProducts'
    | 'productMode'
    | 'inactiveReason'
    | 'validFrom'
    | 'validTo'
    | 'conditionAmount'
    | 'conditionQuantity'
>;

// A product-side filter is only validated and stored, never evaluated, so such a rule says nothing about a line.
export function ruleCoversProduct(
    rule: ApplicableRule,
    members: ReadonlySet<string>,
    productErpId: string,
    now: Date,
): boolean {
    if (rule.inactiveReason) return false;
    if (rule.validFrom.getTime() > now.getTime()) return false;
    if (rule.validTo && rule.validTo.getTime() < now.getTime()) return false;
    if (rule.allProducts) return true;
    return rule.productMode !== 'filter' && members.has(productErpId);
}

// The deepest covering percent wins, as for discounts.
export function lineRetroBonus<R extends ApplicableRule>(
    rules: R[],
    membersOf: (rule: R) => ReadonlySet<string>,
    line: { orderLineId: string; productErpId: string; lineTotal: number },
    now: Date,
): LineRetroBonus | null {
    const covering = rules.filter(r => ruleCoversProduct(r, membersOf(r), line.productErpId, now));
    if (covering.length === 0) return null;
    const best = covering.reduce((a, b) => (b.percent > a.percent ? b : a));
    const plain = best.conditionAmount === null && best.conditionQuantity === null;
    return {
        orderLineId: line.orderLineId,
        percent: best.percent,
        amount: plain ? Math.round((line.lineTotal * best.percent) / 100) : null,
    };
}
