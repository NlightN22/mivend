// Mivend-pipeline statuses rank below every ERP fact status; the ERP reference ranks start at 3.
const LOCAL_RANK: Record<string, number> = {
    PENDING: 0,
    REJECTED: 0,
    SENT_TO_ERP: 1,
    RESERVED: 2,
    CONFIRMED: 2,
};

// A reference-ranked status may only move an order forward; CANCELLED is terminal (owner decision,
// even if 1C later unmarks the deletion). Unknown current values never block, an unknown next one does.
export function canAdvanceErpStatus(
    current: string | null | undefined,
    next: string,
    referenceRanks: ReadonlyMap<string, number>,
): boolean {
    if (current === 'CANCELLED') return false;
    const rankOf = (status: string): number | undefined =>
        LOCAL_RANK[status] ?? referenceRanks.get(status);
    const nextRank = rankOf(next);
    if (nextRank === undefined) return false;
    const currentRank = current == null ? undefined : rankOf(current);
    return currentRank === undefined || nextRank > currentRank;
}
