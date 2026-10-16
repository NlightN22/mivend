export interface SplitPlan {
    keep: number;
    shortfall: number;
}

// The kept part is whole packs of what fits; the rest is demand not served.
export function planSplit(needed: number, fitting: number, multiple: number): SplitPlan {
    const step = Math.max(1, multiple);
    const fits = Math.max(0, Math.min(needed, fitting));
    const keep = Math.floor(fits / step) * step;
    return { keep, shortfall: needed - keep };
}
