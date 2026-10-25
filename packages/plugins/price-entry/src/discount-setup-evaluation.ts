export type DiscountConditionMetric = 'quantity' | 'amount';

export interface LoadedDiscountSetup {
    id: number;
    percent: number;
    allProducts: boolean;
    // Null = unconditional (empty ERP condition).
    metric: DiscountConditionMetric | null;
    conditionNumber: number | null;
}

export interface SetupEvaluation {
    rules: LoadedDiscountSetup[];
    // Per setup: which of the products in play (order lines + the priced one) are members.
    membersBySetup: Map<number, Set<string>>;
    productErpId: string | null;
    quantityByProductErpId: Map<string, number>;
    // Kopecks; the ERP threshold is in currency units.
    documentAmount: number;
}

// Several matching setups never stack: the highest percent wins, a negative one (markup) competes by max.
// A list setup behaves like an "all products" one restricted to its list: quantities sum over its members.
export function bestSetupPercent(input: SetupEvaluation): number | null {
    let best: number | null = null;
    for (const rule of input.rules) {
        const members = input.membersBySetup.get(rule.id);
        if (
            !rule.allProducts &&
            !(input.productErpId !== null && members?.has(input.productErpId))
        ) {
            continue;
        }
        if (!meetsCondition(rule, members, input)) continue;
        if (best === null || rule.percent > best) best = rule.percent;
    }
    return best;
}

function meetsCondition(
    rule: LoadedDiscountSetup,
    members: Set<string> | undefined,
    input: SetupEvaluation,
): boolean {
    const threshold = rule.conditionNumber ?? 0;
    if (rule.metric === 'amount') return input.documentAmount >= Math.round(threshold * 100);
    if (rule.metric === 'quantity') {
        let quantity = 0;
        for (const [productErpId, lineQuantity] of input.quantityByProductErpId) {
            if (rule.allProducts || members?.has(productErpId)) quantity += lineQuantity;
        }
        return quantity >= threshold;
    }
    return true;
}
