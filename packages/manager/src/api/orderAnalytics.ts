import { adminApi } from './client';
import { OrderAnalyticsDocument } from './generated/graphql';
import { periodInstants } from './orderAnalyticsPeriod';

export type OrderGranularity = 'NONE' | 'DAY' | 'MONTH';
export type OrderDimension = 'NONE' | 'CUSTOMER' | 'ORGANIZATION' | 'POINT_OF_SALE' | 'MANAGER';
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
    'POINT_OF_SALE',
    'ORGANIZATION',
];

export function fetchOrderAnalytics(
    params: OrderAnalyticsParams,
    fixed: OrderAnalyticsFixedFilter = {},
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
        },
    }).then(r => r.orderAnalytics as OrderAnalyticsResult);
}
