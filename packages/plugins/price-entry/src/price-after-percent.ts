import type { ResolvedPrice } from './price-resolution.service';

// Sources combine by max, never additively: discounts from different rules must not stack.
export function priceAfterBestPercent(
    basePrice: number,
    percents: Array<number | null>,
): ResolvedPrice {
    const bestPercent = percents
        .filter((p): p is number => p !== null)
        .reduce((max, p) => Math.max(max, p), -Infinity);

    if (bestPercent === -Infinity) return { customerPrice: basePrice, compareAtPrice: null };
    // A negative best percent is a markup: it raises the price and is never shown as a discount or markup.
    return {
        customerPrice: Math.round(basePrice * (1 - bestPercent / 100)),
        compareAtPrice: bestPercent <= 0 ? null : basePrice,
    };
}
