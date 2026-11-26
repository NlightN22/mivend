import { adminApi } from './client';
import { OrderAnalyticsDocument, OrderAnalyticsSuggestDocument } from './generated/graphql';
import type { OrderAnalyticsFilterKind } from './generated/graphql';
import type { OrderAnalyticsGroupFilter } from './analyticsGroups';
import { periodInstants } from './orderAnalyticsPeriod';

export type OrderGranularity = 'NONE' | 'DAY' | 'MONTH';
export type OrderDimension =
    | 'NONE'
    | 'CUSTOMER'
    | 'ORGANIZATION'
    | 'POINT_OF_SALE'
    | 'MANAGER'
    | 'COUNTERPARTY_MANAGER';
export type OrderAnalyticsState = 'OK' | 'NOT_CONFIGURED' | 'TOO_LARGE' | 'UNAVAILABLE';

// An embedded report pins one entity by its mivend id; the server resolves the ERP id and the scope.
export interface OrderAnalyticsFixedFilter {
    counterpartyId?: string;
    administratorId?: string;
}

export interface OrderAnalyticsParams {
    from: string;
    to: string;
    granularity: OrderGranularity;
    dimension: OrderDimension;
}

// Names picked in the filter builder; the server turns them into ids inside the viewer's scope.
export interface OrderAnalyticsEntityFilter {
    kind: OrderAnalyticsFilterKind;
    values: string[];
    exact?: boolean;
    exclude?: boolean;
}

export interface OrderAnalyticsExtras {
    entityFilters?: OrderAnalyticsEntityFilter[];
    groupFilters?: OrderAnalyticsGroupFilter[];
    mainManagerOnly?: boolean;
}

export interface OrderAnalyticsRow {
    periodStart: string | null;
    dimensionId: string;
    label: string;
    currency: string;
    turnover: string;
    turnoverExcludingVat: string;
    vatTotal: string;
    orderCount: number;
    ordersWithoutAmount: number;
    productQuantity: string;
    productAmount: string;
    productLinesWithoutAmount: number;
}

export interface OrderAnalyticsResult {
    state: OrderAnalyticsState;
    rows: OrderAnalyticsRow[];
    limitedToVisibleCustomers: boolean;
}

export const GRANULARITIES: OrderGranularity[] = ['NONE', 'DAY', 'MONTH'];
export const DIMENSIONS: OrderDimension[] = [
    'NONE',
    'CUSTOMER',
    'MANAGER',
    'COUNTERPARTY_MANAGER',
    'POINT_OF_SALE',
    'ORGANIZATION',
];

export function fetchOrderAnalytics(
    params: OrderAnalyticsParams,
    fixed: OrderAnalyticsFixedFilter = {},
    extras: OrderAnalyticsExtras = {},
): Promise<OrderAnalyticsResult> {
    const { from, to } = periodInstants(params);
    return adminApi(OrderAnalyticsDocument, {
        input: {
            from,
            to,
            granularity: params.granularity,
            dimension: params.dimension,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...fixed,
            entityFilters: extras.entityFilters?.length ? extras.entityFilters : null,
            groupFilters: extras.groupFilters?.length ? extras.groupFilters : null,
            mainManagerOnly: extras.mainManagerOnly ?? false,
        },
    }).then(r => r.orderAnalytics as OrderAnalyticsResult);
}

export function suggestOrderAnalytics(
    kind: OrderAnalyticsFilterKind,
    prefix: string,
): Promise<string[]> {
    return adminApi(OrderAnalyticsSuggestDocument, { kind, prefix }).then(
        r => r.orderAnalyticsSuggest,
    );
}
