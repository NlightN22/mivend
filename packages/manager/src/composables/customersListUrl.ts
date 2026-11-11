import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import {
    BLANK_CUSTOMERS_FILTERS,
    CUSTOMERS_SORT_FIELDS,
    DEFAULT_CUSTOMERS_SORT,
    isCustomersView,
    type CustomersListFilters,
    type CustomersSort,
} from '../api/customersList';
import { CUSTOMERS_FILTER_COLUMNS } from '../api/customersFilter';

export interface CustomersUrlState {
    [key: string]: string;
    search: string;
    view: string;
    filters: string;
    sortField: string;
    sortDir: string;
    pageSize: string;
}

export const CUSTOMERS_URL_DEFAULTS: CustomersUrlState = {
    search: '',
    view: 'all',
    filters: '',
    sortField: DEFAULT_CUSTOMERS_SORT.field,
    sortDir: DEFAULT_CUSTOMERS_SORT.dir,
    pageSize: '20',
};

export function toCustomersUrlState(
    filters: CustomersListFilters,
    sort: CustomersSort,
    pageSize: number,
): CustomersUrlState {
    return {
        search: filters.search,
        view: filters.view,
        filters: conditionsToQuery(filters.conditions),
        sortField: sort.field,
        sortDir: sort.dir,
        pageSize: String(pageSize),
    };
}

export function fromCustomersUrlState(url: CustomersUrlState): {
    filters: CustomersListFilters;
    sort: CustomersSort;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_CUSTOMERS_FILTERS,
            search: url.search,
            view: isCustomersView(url.view) ? url.view : 'all',
            conditions: conditionsFromQuery(url.filters, CUSTOMERS_FILTER_COLUMNS),
        },
        sort: {
            field:
                CUSTOMERS_SORT_FIELDS.find(f => f === url.sortField) ??
                DEFAULT_CUSTOMERS_SORT.field,
            dir: url.sortDir === 'DESC' ? 'DESC' : 'ASC',
        },
        pageSize: pageSize > 0 ? pageSize : 20,
    };
}
