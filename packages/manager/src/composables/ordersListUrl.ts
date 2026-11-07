import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { OrdersListFilters, OrdersView } from '../api/orders-list';
import { ORDERS_FILTER_COLUMNS } from '../api/orders-filter';
import { ORDERS_VIEWS } from '../api/orders-list';
import type { OrderSortField } from '../api/orders';

export interface OrdersListUrlState {
    [key: string]: string;
    search: string;
    view: string;
    filters: string;
    sortField: string;
    sortDir: string;
    pageSize: string;
}

export const ORDERS_URL_DEFAULTS: OrdersListUrlState = {
    search: '',
    view: 'all',
    filters: '',
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

export function toUrlState(
    filters: OrdersListFilters,
    sort: OrdersSort,
    pageSize: number,
): OrdersListUrlState {
    return {
        search: filters.search,
        view: filters.view,
        filters: conditionsToQuery(filters.conditions),
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
            search: url.search,
            view,
            conditions: conditionsFromQuery(url.filters, ORDERS_FILTER_COLUMNS),
        },
        sort: { field, dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC' },
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
