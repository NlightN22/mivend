// tierProgress.current/nextThreshold are kg for a WEIGHT metric, kopecks for AMOUNT —
// same formatting convention used in the catalog tier tooltip and the cart progress bar.
export function formatTierValue(value: number, metric: 'WEIGHT' | 'AMOUNT'): string {
    return metric === 'WEIGHT'
        ? `${value.toLocaleString()} kg`
        : `${(value / 100).toLocaleString()} ₽`;
}
