export type DiscountChangeRefusal = 'increases-discount' | 'beyond-reference';

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
