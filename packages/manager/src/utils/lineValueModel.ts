// Unit price and discount percent are two views of one value, measured from the customer's reference price.
export function referencePrice(
    effectiveMinor: number,
    serverPercent: number | null,
    listMinor: number,
): number {
    if (serverPercent === null || serverPercent >= 100) return listMinor;
    return Math.round(effectiveMinor / (1 - serverPercent / 100));
}

export function priceFromPercent(referenceMinor: number, percentText: string): string | null {
    const percent = Number(percentText);
    if (percentText.trim() === '' || Number.isNaN(percent) || referenceMinor <= 0) return null;
    return (Math.round(referenceMinor * (1 - percent / 100)) / 100).toFixed(2);
}

export function percentFromPrice(referenceMinor: number, priceText: string): string | null {
    const price = Number(priceText);
    if (priceText.trim() === '' || Number.isNaN(price) || referenceMinor <= 0) return null;
    const percent = Math.round(
        ((referenceMinor - Math.round(price * 100)) / referenceMinor) * 10000,
    );
    return String(percent / 100);
}

export interface CapHint {
    kind: 'none' | 'limit' | 'approval';
    text: string;
}

// Only a deeper discount than the current price is gated; reducing, keeping or a surcharge is free.
export function capHint(
    percentText: string,
    currentMinor: number,
    requestedMinor: number,
    max: number | null,
): CapHint {
    if (max === null) return { kind: 'none', text: '' };
    const percent = Number(percentText);
    const deepening = requestedMinor < currentMinor;
    if (deepening && !Number.isNaN(percent) && percent > max) {
        return {
            kind: 'approval',
            text: `Over your limit of ${max}%: will be sent for approval`,
        };
    }
    return { kind: 'limit', text: `Your limit: ${max}%` };
}
