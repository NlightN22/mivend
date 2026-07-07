// Plain English copy, matching the rest of the storefront's hardcoded-English
// convention (cart/catalog chrome isn't wired through vue-i18n — only the login
// screen currently is). Centralized here instead of repeating literals per call site.

export function discountAddToCartHint(percent: number, brand: string): string {
    return `${percent}% discount on ${brand}`;
}

export function discountLineReason(brand: string, percent: number): string {
    return `${brand} brand discount: −${percent}%`;
}

export function discountTierReachedReason(brand: string, value: string, percent: number): string {
    return `${brand} volume reached: ${value} → −${percent}%`;
}

export function discountTierComplete(percent: number): string {
    return `Maximum discount unlocked: −${percent}%`;
}

export function discountTierProgress(current: string, next: string, percent: number): string {
    return `${current} of ${next} for −${percent}%`;
}

export function discountTierCurrentSuffix(percent: number): string {
    return `(currently −${percent}%)`;
}

export const discountTooltipTitle = 'Volume discount';

export function stockInsufficient(qty: number): string {
    return `Only ${qty} pcs. available`;
}

export const stockInsufficientGeneric = 'Not enough stock';
export const stockAddFailed = 'Could not add item to cart';
export const stockUpdateFailed = 'Could not update quantity';
