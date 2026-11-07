import type { AmountRangeFilterValue, DateRangeFilterValue } from '@mivend/ui-kit';
import type { OrdersListFilters, OrdersView } from '../../api/orders-list';
import type { OrdersSort } from '../../composables/ordersListUrl';
import type { OrderSortField } from '../../api/orders';

// Column-keyed filter state held by the table; `view` lives outside it (the chips above the table).
export interface OrdersTableFilters {
    [key: string]: unknown;
    code: string;
    date: DateRangeFilterValue;
    state: string[];
    manager: string;
    placedBy: string;
    reservationState: string;
    total: AmountRangeFilterValue;
}

export const BLANK_TABLE_FILTERS: OrdersTableFilters = {
    code: '',
    date: { preset: '', from: '', to: '' },
    state: [],
    manager: '',
    placedBy: '',
    reservationState: '',
    total: { mode: 'range', min: undefined, max: undefined },
};

function toMinor(value: number | undefined): number | undefined {
    return value === undefined ? undefined : Math.round(value * 100);
}
function toMajor(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value / 100;
}

export function tableFiltersToList(f: OrdersTableFilters, view: OrdersView): OrdersListFilters {
    return {
        search: f.code,
        view,
        state: f.state,
        reservationState: f.reservationState,
        dateRange: f.date,
        managerId: f.manager,
        placedBy: f.placedBy,
        totalMin: toMinor(f.total.min),
        totalMax: toMinor(f.total.max),
    };
}

export function listFiltersToTable(f: OrdersListFilters): OrdersTableFilters {
    return {
        code: f.search,
        date: f.dateRange,
        state: f.state,
        manager: f.managerId,
        placedBy: f.placedBy,
        reservationState: f.reservationState,
        total: { mode: 'range', min: toMajor(f.totalMin), max: toMajor(f.totalMax) },
    };
}

export interface SortColumn {
    field: string;
    sortField?: string;
}

export function sortToState(
    sort: OrdersSort,
    columns: SortColumn[],
): { field: string; order: 1 | -1 }[] {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(
    state: { field: string; order: 1 | -1 }[],
    columns: SortColumn[],
): OrdersSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { field: 'createdAt', dir: 'DESC' };
    return { field: column.sortField as OrderSortField, dir: first.order === 1 ? 'ASC' : 'DESC' };
}
