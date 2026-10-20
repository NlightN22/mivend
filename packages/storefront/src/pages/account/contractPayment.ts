import { isOverdue, owed, type UnpaidDoc } from './balanceView';

export type ContractPayMode = 'debt-repayment' | 'advance';

export interface ContractDebt {
    minor: number;
    overdueMinor: number;
}

export function contractDebt(
    contractId: string,
    unpaid: ReadonlyArray<UnpaidDoc & { contractId?: string | null }>,
    now: Date = new Date(),
): ContractDebt {
    let minor = 0;
    let overdueMinor = 0;
    for (const doc of unpaid) {
        if (doc.contractId !== contractId) continue;
        minor += owed(doc);
        if (isOverdue(doc, now)) overdueMinor += owed(doc);
    }
    return { minor, overdueMinor };
}

export function initialAmountText(mode: ContractPayMode, debt: ContractDebt): string {
    return mode === 'debt-repayment' && debt.minor > 0 ? (debt.minor / 100).toFixed(2) : '';
}

// Accepts "60 000,50" or "60000.5"; null unless a positive amount with at most two decimals.
export function parseAmountMinor(text: string): number | null {
    const normalized = text.replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const minor = Math.round(Number(normalized) * 100);
    return minor > 0 && Number.isSafeInteger(minor) ? minor : null;
}
