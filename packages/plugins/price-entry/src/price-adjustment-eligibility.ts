import { discountPercent, exceedsCeiling } from './discount-percent';

// A price request needs an approver whose own limit (no row = 0%) is at least as deep as the discount it asks for.
export function mayApprovePrice(input: {
    requestedPrice: number;
    reference: number | null;
    approverCeiling: number;
}): boolean {
    const percent =
        input.reference === null ? null : discountPercent(input.reference, input.requestedPrice);
    return !exceedsCeiling(percent, input.approverCeiling);
}
