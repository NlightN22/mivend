// Below this share of the limit left, the limit counts as almost exhausted (account dashboard and balance page).
export const LIMIT_REMAINING_WARNING_SHARE = 0.2;

export function isLimitAlmostExhausted(used: number, limit: number | null): boolean {
    if (!limit || limit <= 0) return false;
    return limit - used < limit * LIMIT_REMAINING_WARNING_SHARE;
}

export function usedPercent(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}
