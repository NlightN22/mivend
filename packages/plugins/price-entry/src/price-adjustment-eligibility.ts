import { discountPercent, exceedsCeiling } from './discount-percent';

// A price request needs an approver whose own limit is at least as deep as the discount it asks for
// (an unset limit is no limit), and, below the floor or with no known floor, the below-floor right as well.
export function mayApprovePrice(input: {
    requestedPrice: number;
    reference: number | null;
    floor: number | null;
    approverCeiling: number | null;
    canApproveBelowFloor: boolean;
}): boolean {
    const belowFloor = input.floor === null || input.requestedPrice < input.floor;
    if (belowFloor && !input.canApproveBelowFloor) return false;
    const percent =
        input.reference === null ? null : discountPercent(input.reference, input.requestedPrice);
    return !exceedsCeiling(percent, input.approverCeiling);
}
