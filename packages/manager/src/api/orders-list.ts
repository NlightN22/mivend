import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    sanitizeConditions,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { tr } from '../utils/lazyLabels';
import { adminApi } from './client';
import { OrdersPageDocument } from './generated/graphql';
import {
    ORDERS_FILTER_COLUMNS,
    conditionsToOrdersFilter,
    mergeFilters,
    upgradeStoredConditions,
} from './orders-filter';
import { ORDER_STATE_BADGE_VARIANT, type OrderListItem, type OrderSortField } from './orders';

export type OrdersView =
    | 'all'
    | 'processing'
    | 'awaiting-shipment'
    | 'awaiting-confirmation'
    | 'rejected-by-erp'
    | 'reservation-failed'
    | 'erp-requirements'
    | 'overdue';

const VIEW_LABEL_KEY: Record<OrdersView, string> = {
    'awaiting-confirmation': 'awaitingConfirmation',
    all: 'all',
    processing: 'processing',
    'awaiting-shipment': 'awaitingShipment',
    overdue: 'overdue',
    'rejected-by-erp': 'rejectedByErp',
    'reservation-failed': 'reservationFailed',
    'erp-requirements': 'erpRequirements',
};

export const ORDERS_VIEWS: { key: OrdersView; readonly label: string }[] = (
    Object.keys(VIEW_LABEL_KEY) as OrdersView[]
).map(key => ({
    key,
    get label(): string {
        return tr(`orders.views.${VIEW_LABEL_KEY[key]}`);
    },
}));

// Same colors as the row badges and flags the view stands for.
export const ORDERS_VIEW_VARIANT: Partial<Record<OrdersView, StatusBadgeVariant>> = {
    processing: ORDER_STATE_BADGE_VARIANT.PaymentAuthorized,
    'awaiting-shipment': ORDER_STATE_BADGE_VARIANT.PaymentSettled,
    'awaiting-confirmation': 'warning',
    'rejected-by-erp': 'danger',
    'reservation-failed': 'warning',
    'erp-requirements': 'warning',
    overdue: 'danger',
};

export const OVERDUE_AFTER_DAYS = 3;

export interface OrdersListFilters {
    // Matches order number, company, INN and phone on the server (the `search` argument).
    search: string;
    view: OrdersView;
    // Toolbar Filter builder, ANDed with the view.
    conditions: FilterCondition[];
}

// A preset is applied on top of the user's filters and never rendered in the filter UI.
// It narrows the list only; the server checks scope the same way with or without it.
export interface OrdersListPreset {
    customerId?: string;
}

export const BLANK_ORDERS_FILTERS: OrdersListFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export interface OrdersListQuery {
    filter: Record<string, unknown>;
    managerId?: string;
    search?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// The view's own fields are ANDed with the same column filters from the builder.
function applyView(
    filter: Record<string, unknown>,
    view: OrdersView,
    rejectedCodes: string[],
    now: Date,
): void {
    switch (view) {
        case 'processing':
            filter.state = { eq: 'PaymentAuthorized' };
            break;
        case 'awaiting-shipment':
            filter.state = { eq: 'PaymentSettled' };
            break;
        case 'awaiting-confirmation':
            filter.reservationState = { eq: 'AWAITING_CONFIRMATION' };
            break;
        case 'rejected-by-erp':
            filter.erpStatus = { in: rejectedCodes };
            break;
        case 'reservation-failed':
            filter.reservationFailureReason = { isNull: false };
            break;
        case 'erp-requirements':
            filter.hasCheckFindings = { eq: true };
            break;
        case 'overdue':
            filter.state = { eq: 'PaymentSettled' };
            filter.orderPlacedAt = {
                before: new Date(now.getTime() - OVERDUE_AFTER_DAYS * DAY_MS).toISOString(),
            };
            break;
        case 'all':
            break;
    }
}

export function buildOrdersListQuery(
    filters: OrdersListFilters,
    rejectedCodes: string[],
    now: Date = new Date(),
): OrdersListQuery {
    const built = conditionsToOrdersFilter(filters.conditions);
    const viewFilter: Record<string, unknown> = {};
    applyView(viewFilter, filters.view, rejectedCodes, now);
    return {
        filter: mergeFilters(built.filter, viewFilter),
        managerId: built.managerId,
        search: filters.search || undefined,
    };
}

export async function fetchOrdersList(
    filters: OrdersListFilters,
    preset: OrdersListPreset,
    rejectedCodes: string[],
    page: number,
    pageSize: number,
    // Key insertion order is the ORDER BY clause order.
    sort: Partial<Record<OrderSortField, 'ASC' | 'DESC'>>,
): Promise<{ items: OrderListItem[]; totalItems: number }> {
    const query = buildOrdersListQuery(filters, rejectedCodes);
    const result = await adminApi(OrdersPageDocument, {
        list: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            sort,
            ...(Object.keys(query.filter).length ? { filter: query.filter } : {}),
        },
        managerId: query.managerId,
        customerId: preset.customerId,
        search: query.search,
    });
    return result.visibleOrders;
}

function str(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

// Rebuilds list filters from a stored view; anything missing or of the wrong type falls back to blank.
export function restoreOrdersFilters(raw: unknown): OrdersListFilters {
    const restored: OrdersListFilters = { ...BLANK_ORDERS_FILTERS };
    if (typeof raw !== 'object' || raw === null) return restored;
    const r = raw as Record<string, unknown>;
    restored.search = str(r.search) ?? '';
    if (ORDERS_VIEWS.some(v => v.key === r.view)) restored.view = r.view as OrdersView;
    restored.conditions = sanitizeConditions(
        upgradeStoredConditions(r.conditions),
        ORDERS_FILTER_COLUMNS,
    );
    return restored;
}
