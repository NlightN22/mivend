export interface AgingEntry {
    key: string;
    date: Date;
    amountMinor: number;
    dueDate: Date | null;
}

export interface AgingInput {
    openingBalanceMinor: number;
    openingDate: Date | null;
    entries: readonly AgingEntry[];
    delayDays: number | null;
    now: Date;
}

export interface AgingResult {
    openByKey: Map<string, number>;
    dueByKey: Map<string, Date>;
    overdueMinor: number;
}

interface Lot {
    key: string;
    amountMinor: number;
    due: Date;
    date: Date;
}

const DAY_MS = 86_400_000;
const EPOCH = new Date(0);

export function dueDateOf(entry: AgingEntry, delayDays: number | null): Date {
    return entry.dueDate ?? new Date(entry.date.getTime() + (delayDays ?? 0) * DAY_MS);
}

// FIFO: credits (payments, returns, a negative opening balance) close the oldest debts first.
// A positive opening balance is debt from before the window, counted as already overdue.
export function ageEntries(input: AgingInput): AgingResult {
    const inWindow = input.entries
        .filter(e => !input.openingDate || e.date >= input.openingDate)
        .sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key));
    const lots: Lot[] = [];
    let credit = 0;
    if (input.openingBalanceMinor > 0) {
        lots.push({
            key: 'opening',
            amountMinor: input.openingBalanceMinor,
            due: EPOCH,
            date: input.openingDate ?? EPOCH,
        });
    } else {
        credit += -input.openingBalanceMinor;
    }
    const dueByKey = new Map<string, Date>();
    for (const entry of inWindow) {
        if (entry.amountMinor > 0) {
            const due = dueDateOf(entry, input.delayDays);
            dueByKey.set(entry.key, due);
            lots.push({ key: entry.key, amountMinor: entry.amountMinor, due, date: entry.date });
        } else {
            credit += -entry.amountMinor;
        }
    }
    const openByKey = new Map<string, number>();
    let overdueMinor = 0;
    for (const lot of lots) {
        const covered = Math.min(lot.amountMinor, credit);
        credit -= covered;
        const open = lot.amountMinor - covered;
        openByKey.set(lot.key, open);
        if (open > 0 && lot.due.getTime() < input.now.getTime()) overdueMinor += open;
    }
    return { openByKey, dueByKey, overdueMinor };
}

export type PaymentStatus = 'paid' | 'partial' | 'overdue' | 'open';

export function paymentStatusOf(
    amountMinor: number,
    openMinor: number | undefined,
    due: Date | undefined,
    now: Date,
): PaymentStatus | null {
    if (amountMinor <= 0 || openMinor === undefined) return null;
    if (openMinor <= 0) return 'paid';
    if (due && due.getTime() < now.getTime()) return 'overdue';
    return openMinor < amountMinor ? 'partial' : 'open';
}
