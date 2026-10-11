const MAX_PACKS_FOR_WHOLE_QUANTITY = 1000;

// Smallest whole base quantity that is a whole number of packs (0.9 -> 9, 2.5 -> 5, 6 -> 6);
// null when none exists, in which case the pack rule is not enforced and the line goes by base unit.
export function wholePackQuantity(ratio: number): number | null {
    for (let packs = 1; packs <= MAX_PACKS_FOR_WHOLE_QUANTITY; packs++) {
        const base = packs * ratio;
        if (Math.abs(base - Math.round(base)) < 1e-9) return Math.round(base);
    }
    return null;
}

// Packs for a base quantity, or null when the quantity is not a whole number of packs.
export function wholePacks(quantity: number, ratio: number): number | null {
    const packs = quantity / ratio;
    return Math.abs(packs - Math.round(packs)) < 1e-9 ? Math.round(packs) : null;
}
