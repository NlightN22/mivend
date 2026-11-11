import type { PaymentForm, PlacementRoute } from 'shared';

export interface PlacementInput {
    form: PaymentForm;
    limitControlled: boolean;
    exceeded: boolean;
    allowExceeding: boolean;
    acknowledged: boolean;
    // The matrix case of the order holds it for a manager (layer 2); read only when the limit is not exceeded.
    confirmationHold?: boolean;
}

export interface PlacementDecision {
    route: PlacementRoute;
    countsAgainstLimit: boolean;
    creditLimitExceeded: boolean;
    prepayment: boolean;
}

// Layer 1: the credit limit decides when exceeded; layer 2: the order's matrix case (docs/payments.md).
// A card payment covers the excess plus the order, so it cures an over-limit order.
export function decidePlacement(input: PlacementInput): PlacementDecision {
    const { form, limitControlled, exceeded, allowExceeding, acknowledged, confirmationHold } =
        input;
    if (form === 'card') {
        return {
            route: 'after-payment',
            countsAgainstLimit: false,
            creditLimitExceeded: false,
            prepayment: false,
        };
    }
    if (limitControlled && exceeded) {
        return {
            route: allowExceeding && acknowledged ? 'erp-now' : 'manager-confirmation',
            countsAgainstLimit: true,
            creditLimitExceeded: true,
            prepayment: false,
        };
    }
    return {
        route: confirmationHold ? 'manager-confirmation' : 'erp-now',
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
