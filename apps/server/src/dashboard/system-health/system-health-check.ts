// Pure derivation logic, kept separate from the React/Dashboard alert plumbing in index.ts so it
// can be unit-tested — mirrors packages/manager/src/api/system-health.ts (issue #76's twin).

export function isZoneMissing(data: { totalItems: number }): boolean {
    return data.totalItems === 0;
}

export function isTaxCategoryMissing(data: { totalItems: number }): boolean {
    return data.totalItems === 0;
}

export function isTaxRateMissing(data: { items: unknown[] }): boolean {
    return data.items.length === 0;
}

export function isDefaultTaxZoneMissing(data: { defaultTaxZone: { id: string } | null }): boolean {
    return !data.defaultTaxZone;
}

export function isShippingMethodMissing(data: { totalItems: number }): boolean {
    return data.totalItems === 0;
}

export function isPaymentMethodMissing(data: { items: { enabled: boolean }[] }): boolean {
    return !data.items.some(m => m.enabled);
}
