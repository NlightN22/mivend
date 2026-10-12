import type { PaymentForm, PlacementRoute } from 'shared';

export interface PlacementInput {
    form: PaymentForm;
    limitControlled: boolean;
    exceeded: boolean;
    allowExceeding: boolean;
    acknowledged: boolean;
}

export interface PlacementDecision {
    route: PlacementRoute;
    countsAgainstLimit: boolean;
    creditLimitExceeded: boolean;
    prepayment: boolean;
}

// The single placement matrix (docs/payments.md "Target model"): form x limit state -> route.
export function decidePlacement(input: PlacementInput): PlacementDecision {
    const { form, limitControlled, exceeded, allowExceeding, acknowledged } = input;
    if (limitControlled && exceeded) {
        return {
            route: allowExceeding && acknowledged ? 'erp-now' : 'manager-confirmation',
            countsAgainstLimit: true,
            creditLimitExceeded: true,
            prepayment: false,
        };
    }
    if (form === 'card') {
        return {
            route: 'after-payment',
            countsAgainstLimit: false,
            creditLimitExceeded: false,
            prepayment: false,
        };
    }
    return {
        route: 'erp-now',
        countsAgainstLimit: true,
        creditLimitExceeded: false,
        prepayment: !limitControlled,
    };
}

// Card pays the debt above the limit that already exists plus the whole order (kopecks).
export function payableAmountKopecks(
    form: PaymentForm,
    totalKopecks: number,
    excessKopecks: number,
): number {
    return form === 'card' ? totalKopecks + excessKopecks : totalKopecks;
}
