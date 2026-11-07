// Share of the reference price given away, rounded to 2 decimals; negative is a markup. No reference price = unknown.
export function discountPercent(reference: number, effective: number): number | null {
    if (!(reference > 0)) return null;
    return Math.round(((reference - effective) / reference) * 10000) / 100;
}

export function exceedsCeiling(percent: number | null, ceiling: number | null): boolean {
    return percent !== null && ceiling !== null && percent > ceiling;
}
