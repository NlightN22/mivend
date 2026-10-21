import { formatAmountInput } from './amountInput';
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

export function initialAmountText(
    mode: ContractPayMode,
    debt: ContractDebt,
    locale: string,
): string {
    return mode === 'debt-repayment' && debt.minor > 0 ? formatAmountInput(debt.minor, locale) : '';
}
