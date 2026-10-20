import { isLimitAlmostExhausted } from '../../utils/creditLimit';

export interface UnpaidDoc {
    id: string;
    currency: string;
    amount: number;
    openAmount?: number | null;
    dueDate?: string | null;
    orders: ReadonlyArray<{ orderId?: string | null }>;
}

export interface BalanceRow {
    contractId?: string | null;
    currency: string;
    currentBalance: number;
    overdue: number;
}

export interface ContractTerms {
    id: string;
    creditLimit?: number | null;
}

export interface MoneyByCurrency {
    currency: string;
    minor: number;
}

export function owed(doc: UnpaidDoc): number {
    return doc.openAmount ?? doc.amount;
}

function sumByCurrency(items: Array<{ currency: string; minor: number }>): MoneyByCurrency[] {
    const map = new Map<string, number>();
    for (const i of items) map.set(i.currency, (map.get(i.currency) ?? 0) + i.minor);
    return [...map.entries()]
        .filter(([, minor]) => minor !== 0)
        .map(([currency, minor]) => ({ currency, minor }));
}

export function dueTotals(docs: readonly UnpaidDoc[]): MoneyByCurrency[] {
    return sumByCurrency(docs.map(d => ({ currency: d.currency, minor: owed(d) })));
}

export function overdueTotals(balances: readonly BalanceRow[]): MoneyByCurrency[] {
    return sumByCurrency(balances.map(b => ({ currency: b.currency, minor: Number(b.overdue) })));
}

export function nextPayment<T extends UnpaidDoc>(docs: readonly T[]): T | null {
    let best: T | null = null;
    for (const d of docs) {
        if (!d.dueDate) continue;
        if (!best || new Date(d.dueDate) < new Date(best.dueDate as string)) best = d;
    }
    return best;
}

export function isOverdue(doc: UnpaidDoc, now: Date = new Date()): boolean {
    return !!doc.dueDate && new Date(doc.dueDate).getTime() < now.getTime();
}

export function orderIdOf(doc: UnpaidDoc): string | null {
    return doc.orders.find(o => o.orderId)?.orderId ?? null;
}

export function contractDebtTotals(
    contractId: string,
    balances: readonly BalanceRow[],
): MoneyByCurrency[] {
    return sumByCurrency(
        balances
            .filter(b => b.contractId === contractId)
            .map(b => ({ currency: b.currency, minor: Number(b.currentBalance) })),
    );
}

export function contractDebtMinor(contractId: string, balances: readonly BalanceRow[]): number {
    return balances
        .filter(b => b.contractId === contractId)
        .reduce((sum, b) => sum + Number(b.currentBalance), 0);
}

export function contractAlmostExhausted(
    contract: ContractTerms,
    balances: readonly BalanceRow[],
): boolean {
    return isLimitAlmostExhausted(
        contractDebtMinor(contract.id, balances) / 100,
        contract.creditLimit ?? null,
    );
}

export type RestrictionKey = 'overdue' | 'nearly' | 'none';

export function restrictions(hasOverdue: boolean, limitNearlyUsed: boolean): RestrictionKey[] {
    const keys: RestrictionKey[] = [];
    if (hasOverdue) keys.push('overdue');
    if (limitNearlyUsed) keys.push('nearly');
    return keys.length ? keys : ['none'];
}
