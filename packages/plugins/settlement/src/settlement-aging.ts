export type PaymentStatus = 'paid' | 'partial' | 'overdue' | 'open' | 'unknown';

// Overdue never exceeds what the customer actually owes now (overpayments, retention gaps).
export function capOverdue(overdueMinor: number, closingBalanceMinor: number): number {
    return Math.min(overdueMinor, Math.max(closingBalanceMinor, 0));
}

// openMinor is null when the entry has no FIFO row (no balance fact for its contract yet).
export function paymentStatusOf(
    amountMinor: number,
    openMinor: number | null,
    due: Date | null,
    now: Date,
): PaymentStatus | null {
    if (amountMinor <= 0) return null;
    if (openMinor === null) return 'unknown';
    if (openMinor <= 0) return 'paid';
    if (due && due.getTime() < now.getTime()) return 'overdue';
    return openMinor < amountMinor ? 'partial' : 'open';
}
