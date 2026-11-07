import type { OrdersListFilters, OrdersView } from '../api/orders-list';
import { BLANK_ORDERS_FILTERS, ORDERS_VIEWS } from '../api/orders-list';
import type { OrderSortField } from '../api/orders';

export interface OrdersListUrlState {
    [key: string]: string;
    search: string;
    view: string;
    state: string;
    reservationState: string;
    datePreset: string;
    dateFrom: string;
    dateTo: string;
    managerId: string;
    placedBy: string;
    totalMin: string;
    totalMax: string;
    sortField: string;
    sortDir: string;
    pageSize: string;
}

export const ORDERS_URL_DEFAULTS: OrdersListUrlState = {
    search: '',
    view: 'all',
    state: '',
    reservationState: '',
    datePreset: '',
    dateFrom: '',
    dateTo: '',
    managerId: '',
    placedBy: '',
    totalMin: '',
    totalMax: '',
    sortField: 'createdAt',
    sortDir: 'DESC',
    pageSize: '10',
};

export interface OrdersSort {
    field: OrderSortField;
    dir: 'ASC' | 'DESC';
}

const SORT_FIELDS: OrderSortField[] = [
    'code',
    'state',
    'totalWithTax',
    'orderPlacedAt',
    'createdAt',
];

function toNumber(value: string): number | undefined {
    const parsed = Number(value);
    return value !== '' && Number.isFinite(parsed) ? parsed : undefined;
}

export function toUrlState(
    filters: OrdersListFilters,
    sort: OrdersSort,
    pageSize: number,
): OrdersListUrlState {
    return {
        search: filters.search,
        view: filters.view,
        state: filters.state.join(','),
        reservationState: filters.reservationState,
        datePreset: filters.dateRange.preset,
        dateFrom: filters.dateRange.from,
        dateTo: filters.dateRange.to,
        managerId: filters.managerId,
        placedBy: filters.placedBy,
        totalMin: filters.totalMin === undefined ? '' : String(filters.totalMin),
        totalMax: filters.totalMax === undefined ? '' : String(filters.totalMax),
        sortField: sort.field,
        sortDir: sort.dir,
        pageSize: String(pageSize),
    };
}

export function fromUrlState(url: OrdersListUrlState): {
    filters: OrdersListFilters;
    sort: OrdersSort;
    pageSize: number;
} {
    const view = ORDERS_VIEWS.some(v => v.key === url.view) ? (url.view as OrdersView) : 'all';
    const field = SORT_FIELDS.find(f => f === url.sortField) ?? 'createdAt';
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_ORDERS_FILTERS,
            search: url.search,
            view,
            state: url.state ? url.state.split(',').filter(Boolean) : [],
            reservationState: url.reservationState,
            dateRange: { preset: url.datePreset, from: url.dateFrom, to: url.dateTo },
            managerId: url.managerId,
            placedBy: url.placedBy,
            totalMin: toNumber(url.totalMin),
            totalMax: toNumber(url.totalMax),
        },
        sort: { field, dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC' },
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
