import type { DateRangeFilterValue, StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import { OrdersPageDocument } from './generated/graphql';
import { PLACED_BY_CUSTOMER_VALUE } from './customers';
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

export const ORDERS_VIEWS: { key: OrdersView; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'processing', label: 'Processing' },
    { key: 'awaiting-shipment', label: 'Awaiting shipment' },
    { key: 'awaiting-confirmation', label: 'Awaiting confirmation' },
    { key: 'rejected-by-erp', label: 'Rejected by ERP' },
    { key: 'reservation-failed', label: 'Reservation failed' },
    { key: 'erp-requirements', label: 'Blocked by ERP requirements' },
    { key: 'overdue', label: 'Overdue' },
];

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
    state: string[];
    reservationState: string;
    dateRange: DateRangeFilterValue;
    managerId: string;
    placedBy: string;
    // Minor currency units, either bound may be open.
    totalMin: number | undefined;
    totalMax: number | undefined;
}

// A preset is applied on top of the user's filters and never rendered in the filter UI.
// It narrows the list only; the server checks scope the same way with or without it.
export interface OrdersListPreset {
    customerId?: string;
}

export const BLANK_ORDERS_FILTERS: OrdersListFilters = {
    search: '',
    view: 'all',
    state: [],
    reservationState: '',
    dateRange: { preset: '', from: '', to: '' },
    managerId: '',
    placedBy: '',
    totalMin: undefined,
    totalMax: undefined,
};

export interface OrdersListQuery {
    filter: Record<string, unknown>;
    managerId?: string;
    search?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function oneOf(values: string[]): Record<string, unknown> {
    return values.length === 1 ? { eq: values[0] } : { in: values };
}

// The view pins its own state/reservation filters and wins over the same column filter.
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
    const filter: Record<string, unknown> = {};
    if (filters.state.length) filter.state = oneOf(filters.state);
    if (filters.reservationState) filter.reservationState = { eq: filters.reservationState };
    const { from, to } = filters.dateRange;
    if (from || to) {
        // createdAt, not orderPlacedAt: unplaced orders must stay listed. `before` is the day after `to`.
        const createdAt: Record<string, string> = {};
        if (from) createdAt.after = new Date(`${from}T00:00:00`).toISOString();
        if (to) {
            const end = new Date(`${to}T00:00:00`);
            createdAt.before = new Date(end.getTime() + DAY_MS).toISOString();
        }
        filter.createdAt = createdAt;
    }
    if (filters.totalMin !== undefined || filters.totalMax !== undefined) {
        filter.totalWithTax = {
            ...(filters.totalMin !== undefined ? { gte: filters.totalMin } : {}),
            ...(filters.totalMax !== undefined ? { lte: filters.totalMax } : {}),
        };
    }
    if (filters.placedBy) {
        filter.placedByAdministratorId =
            filters.placedBy === PLACED_BY_CUSTOMER_VALUE
                ? { isNull: true }
                : { eq: filters.placedBy };
    }
    applyView(filter, filters.view, rejectedCodes, now);
    return {
        filter,
        managerId: filters.managerId || undefined,
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
        options: {
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

function localDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export function todayRange(now: Date = new Date()): DateRangeFilterValue {
    const today = localDate(now);
    return { preset: 'today', from: today, to: today };
}

// A saved view stores filters as JSON; older saves use another shape, so keep only what parses.
export function restoreSavedFilters(json: string): OrdersListFilters {
    const restored: OrdersListFilters = { ...BLANK_ORDERS_FILTERS };
    let raw: Record<string, unknown>;
    try {
        raw = JSON.parse(json) as Record<string, unknown>;
    } catch {
        return restored;
    }
    if (typeof raw.search === 'string') restored.search = raw.search;
    if (ORDERS_VIEWS.some(v => v.key === raw.view)) restored.view = raw.view as OrdersView;
    if (Array.isArray(raw.state)) restored.state = raw.state.filter(v => typeof v === 'string');
    else if (typeof raw.state === 'string' && raw.state) restored.state = [raw.state];
    if (typeof raw.reservationState === 'string') restored.reservationState = raw.reservationState;
    if (typeof raw.managerId === 'string') restored.managerId = raw.managerId;
    if (typeof raw.placedBy === 'string') restored.placedBy = raw.placedBy;
    return restored;
}
