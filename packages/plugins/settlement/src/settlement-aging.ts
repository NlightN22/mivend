import type { CounterpartyOverdue, SettlementBalanceCard } from './settlement-shop.types';

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

const DAY_MS = 86_400_000;

// Sums the overdue of every contract card (one currency per counterparty in practice; the first overdue card names it).
export function summariseOverdue(
    cards: Pick<SettlementBalanceCard, 'overdue' | 'currency' | 'oldestOverdueDue'>[],
    now: Date,
    fallbackCurrency: string,
): CounterpartyOverdue {
    const overdue = cards.filter(c => c.overdue > 0);
    const dues = overdue.flatMap(c => (c.oldestOverdueDue ? [c.oldestOverdueDue.getTime()] : []));
    return {
        amount: overdue.reduce((sum, c) => sum + c.overdue, 0),
        currency: overdue[0]?.currency ?? cards[0]?.currency ?? fallbackCurrency,
        oldestDays: dues.length
            ? Math.max(0, Math.floor((now.getTime() - Math.min(...dues)) / DAY_MS))
            : null,
    };
}
