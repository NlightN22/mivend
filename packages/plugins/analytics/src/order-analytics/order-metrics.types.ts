export type OrderGranularity = 'NONE' | 'DAY' | 'MONTH';
export type OrderDimension =
    | 'NONE'
    | 'CUSTOMER'
    | 'ORGANIZATION'
    | 'POINT_OF_SALE'
    | 'MANAGER'
    | 'COUNTERPARTY_MANAGER';

export interface OrderMetricsFilters {
    customerIds: string[];
    organizationIds: string[];
    pointOfSaleIds: string[];
    managerIds: string[];
    counterpartyManagerIds: string[];
    productIds: string[];
    manufacturerIds: string[];
    excludeCustomerIds: string[];
    excludeOrganizationIds: string[];
    excludePointOfSaleIds: string[];
    excludeManagerIds: string[];
    excludeCounterpartyManagerIds: string[];
    excludeProductIds: string[];
    excludeManufacturerIds: string[];
    manufacturerGroupIds: string[];
    excludeManufacturerGroupIds: string[];
    // Held back from the wire unless the category and customer group filters are switched on.
    productCategoryIds: string[];
    excludeProductCategoryIds: string[];
    customerGroupIds: string[];
    excludeCustomerGroupIds: string[];
}

export interface OrderMetricsRequest extends OrderMetricsFilters {
    mainManagerOnly: boolean;
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
    // Set only when a product or manufacturer filter was sent; the amounts are then empty.
    productQuantity: string;
    productAmount: string;
    productLinesWithoutAmount: number;
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
