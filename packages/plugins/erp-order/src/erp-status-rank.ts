const RANK: Record<string, number> = {
    PENDING: 0,
    REJECTED: 0,
    SENT_TO_ERP: 1,
    RESERVED: 2,
    CONFIRMED: 2,
    UNDER_APPROVAL: 3,
    APPROVED: 4,
    PICKING: 5,
    SHIPPING: 6,
    DELIVERING: 7,
    DELIVERED: 8,
};

// A fact-derived status may only move an order forward; CANCELLED is terminal and an unknown
// current value (null, legacy) never blocks.
export function canAdvanceErpStatus(current: string | null | undefined, next: string): boolean {
    if (current === 'CANCELLED') return false;
    const nextRank = RANK[next];
    if (nextRank === undefined) return false;
    const currentRank = current == null ? undefined : RANK[current];
    return currentRank === undefined || nextRank > currentRank;
}
