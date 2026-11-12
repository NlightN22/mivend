import type { RequestContext } from '@vendure/core';

export interface CurrencyAmount {
    currency: string;
    amountMinor: number;
}

export interface ContractBalanceRow {
    contractId: string | null;
    contractErpId: string;
    contractName: string | null;
    organizationName: string | null;
    currency: string;
    closingBalanceMinor: number;
    openingDate: Date | null;
}

export interface CounterpartyMetrics {
    currency: string;
    balanceMinor: number;
    balances: CurrencyAmount[];
    contractBalances: ContractBalanceRow[];
    salesLast30DaysMinor: number;
    salesPrev30DaysMinor: number;
    salesLast12MonthsMinor: number;
    saleDocumentsLast12Months: number;
    averageCheckMinor: number | null;
    openOrdersCount: number;
    computedAt: Date;
}

// A precomputed rollup can implement this without touching the resolver or the UI.
export interface CounterpartyMetricsProvider {
    metrics(ctx: RequestContext, counterpartyId: string): Promise<CounterpartyMetrics>;
}
