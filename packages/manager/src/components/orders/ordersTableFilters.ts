import type { OrderSortField } from '../../api/orders';
import type { OrdersSort } from '../../composables/ordersListUrl';

// What the table itself holds: the search term. Column filters are the builder's conditions.
export interface OrdersTableFilters {
    [key: string]: unknown;
    code: string;
}

export const BLANK_TABLE_FILTERS: OrdersTableFilters = { code: '' };

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
