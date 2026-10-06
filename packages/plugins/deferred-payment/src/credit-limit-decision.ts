export const CREDIT_LIMIT_EXCEEDED = 'credit-limit-exceeded';

export interface CreditLimitOverrun {
    creditLimit: number;
    creditBalance: number;
    orderTotal: number;
}

// Counterparty credit fields are whole rubles; Vendure order totals are minor units.
export function exceedsCreditLimit(
    counterparty: { creditLimit: number; creditBalance: number },
    orderTotalMinor: number,
): CreditLimitOverrun | null {
    const orderTotal = orderTotalMinor / 100;
    const creditLimit = Number(counterparty.creditLimit);
    const creditBalance = Number(counterparty.creditBalance);
    if (creditBalance + orderTotal <= creditLimit) return null;
    return { creditLimit, creditBalance, orderTotal };
}

export function formatOverrunMessage(overrun: CreditLimitOverrun): string {
    return `${CREDIT_LIMIT_EXCEEDED}: ${JSON.stringify(overrun)}`;
}
