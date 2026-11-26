import type { OrderGranularity } from '../order-analytics/order-metrics.types';

export type SalesDimension =
    | 'NONE'
    | 'COUNTERPARTY'
    | 'ORGANIZATION'
    | 'CONTRACT'
    | 'COUNTERPARTY_MANAGER';

export interface SalesMetricsFilters {
    counterpartyIds: string[];
    organizationIds: string[];
    contractIds: string[];
    counterpartyManagerIds: string[];
    excludeCounterpartyIds: string[];
    excludeOrganizationIds: string[];
    excludeContractIds: string[];
    excludeCounterpartyManagerIds: string[];
    // Held back from the wire unless the customer group filters are switched on.
    counterpartyGroupIds: string[];
    excludeCounterpartyGroupIds: string[];
}

export interface SalesMetricsRequest extends SalesMetricsFilters {
    mainManagerOnly: boolean;
    from: Date;
    to: Date;
    granularity: OrderGranularity;
    dimension: SalesDimension;
    timeZone: string;
}

export interface SalesAmount {
    amount: string;
    amountExcludingVatBasis: string;
    documentCount: number;
    documentsWithoutAmount: number;
}

export interface SalesTurnoverRow {
    periodStart: Date | null;
    dimensionId: string;
    currency: string;
    sales: SalesAmount;
    returns: SalesAmount;
    corrections: SalesAmount;
    netSales: SalesAmount;
}

export interface SalesTurnover {
    rows: SalesTurnoverRow[];
    correctionsWithoutEffect: number;
    unresolvedCurrencies: string[];
}
