import { classifySelectionFilter } from 'shared';
import type { FilterSide, FilterTerm } from 'shared';

import type { RetroBonusRuleValues } from './retro-bonus-rule.service';

export interface RuleClassification {
    terms: FilterTerm[];
    inactiveReason: string | null;
}

// A side in filter mode behind no "all" flag must be evaluable; the first unevaluable side names the reason.
export function classifyRule(
    rule: Pick<
        RetroBonusRuleValues,
        | 'counterpartyMode'
        | 'allCounterparties'
        | 'counterpartyFilter'
        | 'productMode'
        | 'allProducts'
        | 'productFilter'
    >,
): RuleClassification {
    const terms: FilterTerm[] = [];
    let inactiveReason: string | null = null;
    const sides: Array<[FilterSide, boolean, unknown[] | null]> = [
        [
            'counterparty',
            rule.counterpartyMode === 'filter' && !rule.allCounterparties,
            rule.counterpartyFilter,
        ],
        ['product', rule.productMode === 'filter' && !rule.allProducts, rule.productFilter],
    ];
    for (const [side, isFilter, filter] of sides) {
        if (!isFilter) continue;
        const classified = classifySelectionFilter(filter, side);
        terms.push(...classified.terms);
        inactiveReason ??= classified.reason ? `${side}-${classified.reason}` : null;
    }
    return { terms: inactiveReason ? [] : terms, inactiveReason };
}
