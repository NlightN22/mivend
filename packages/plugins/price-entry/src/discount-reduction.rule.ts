import { discountPercent, exceedsCeiling } from './discount-percent';

export type DiscountChangeRefusal = 'increases-discount' | 'beyond-reference' | 'over-limit';

// Staff may only move a line price toward its reference price: never lower, never past it (a markup stays as it is).
export function reductionRefusal(input: {
    current: number;
    reference: number;
    target: number;
}): DiscountChangeRefusal | null {
    if (input.target < input.current) return 'increases-discount';
    if (input.target > Math.max(input.current, input.reference)) return 'beyond-reference';
    return null;
}

// Back to automatic: fine when it gives no more than now; a bigger automatic discount needs a limit that covers it.
export function revertRefusal(input: {
    current: number;
    reference: number;
    automatic: number;
    ceiling: number | null;
}): DiscountChangeRefusal | null {
    if (input.automatic >= input.current) return null;
    if (input.ceiling === null) return 'increases-discount';
    return exceedsCeiling(discountPercent(input.reference, input.automatic), input.ceiling)
        ? 'over-limit'
        : null;
}
