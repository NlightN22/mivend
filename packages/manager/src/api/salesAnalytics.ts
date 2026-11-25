import { adminApi } from './client';
import { SalesAnalyticsDocument } from './generated/graphql';
import type { OrderAnalyticsFilterKind } from './generated/graphql';
import type {
    OrderAnalyticsEntityFilter,
    OrderAnalyticsParams,
    OrderAnalyticsState,
    OrderGranularity,
} from './orderAnalytics';
import { periodInstants } from './orderAnalyticsPeriod';

export type SalesDimension =
    | 'NONE'
    | 'COUNTERPARTY'
    | 'ORGANIZATION'
    | 'CONTRACT'
    | 'COUNTERPARTY_MANAGER';

export interface SalesAnalyticsParams extends Omit<OrderAnalyticsParams, 'dimension'> {
    granularity: OrderGranularity;
    dimension: SalesDimension;
}

export interface SalesAmount {
    amount: string;
    amountExcludingVatBasis: string;
    documentCount: number;
    documentsWithoutAmount: number;
}

export interface SalesAnalyticsRow {
    periodStart: string | null;
    dimensionId: string;
    label: string;
    currency: string;
    sales: SalesAmount;
    returns: SalesAmount;
    corrections: SalesAmount;
    netSales: SalesAmount;
}

export interface SalesAnalyticsResult {
    state: OrderAnalyticsState;
    rows: SalesAnalyticsRow[];
    correctionsWithoutEffect: number;
    unresolvedCurrencies: string[];
    limitedToVisibleCustomers: boolean;
}

export interface SalesAnalyticsExtras {
    entityFilters?: OrderAnalyticsEntityFilter[];
    mainManagerOnly?: boolean;
}

export const SALES_DIMENSIONS: SalesDimension[] = [
    'NONE',
    'COUNTERPARTY',
    'ORGANIZATION',
    'CONTRACT',
    'COUNTERPARTY_MANAGER',
];

// The builder column key per entity; the typed name goes to the server, which resolves it inside the viewer's scope.
export const SALES_FILTER_KEYS: Record<string, OrderAnalyticsFilterKind> = {
    customer: 'CUSTOMER',
    organization: 'ORGANIZATION',
    contract: 'CONTRACT',
    counterpartyManager: 'COUNTERPARTY_MANAGER',
};

export function fetchSalesAnalytics(
    params: SalesAnalyticsParams,
    extras: SalesAnalyticsExtras = {},
): Promise<SalesAnalyticsResult> {
    const { from, to } = periodInstants(params);
    return adminApi(SalesAnalyticsDocument, {
        input: {
            from,
            to,
            granularity: params.granularity,
            dimension: params.dimension,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            entityFilters: extras.entityFilters?.length ? extras.entityFilters : null,
            mainManagerOnly: extras.mainManagerOnly ?? false,
        },
    }).then(r => r.salesAnalytics as SalesAnalyticsResult);
}
