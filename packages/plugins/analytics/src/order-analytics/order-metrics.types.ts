export type OrderGranularity = 'NONE' | 'DAY' | 'MONTH';
export type OrderDimension = 'NONE' | 'CUSTOMER' | 'ORGANIZATION' | 'POINT_OF_SALE' | 'MANAGER';

export interface OrderMetricsFilters {
    customerIds: string[];
    organizationIds: string[];
    pointOfSaleIds: string[];
    managerIds: string[];
}

export interface OrderMetricsRequest extends OrderMetricsFilters {
    from: Date;
    to: Date;
    granularity: OrderGranularity;
    dimension: OrderDimension;
    timeZone: string;
}

export interface OrderTurnoverRow {
    periodStart: Date | null;
    dimensionId: string;
    currency: string;
    turnover: string;
    turnoverExcludingVat: string;
    vatTotal: string;
    orderCount: number;
    ordersWithoutAmount: number;
}

export type OrderMetricsErrorKind =
    | 'NOT_CONFIGURED'
    | 'UNAUTHENTICATED'
    | 'INVALID_ARGUMENT'
    | 'PERMISSION_DENIED'
    | 'TOO_LARGE'
    | 'TIMEOUT'
    | 'UNAVAILABLE';

export class OrderMetricsError extends Error {
    constructor(
        readonly kind: OrderMetricsErrorKind,
        message: string,
    ) {
        super(message);
        this.name = 'OrderMetricsError';
    }
}

export const MAX_FILTER_VALUES = 1000;
