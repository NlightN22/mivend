import {
    sanitizeConditions,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { adminApi } from './client';
import { CustomersViewCountsDocument, type CounterpartyFilterParameter } from './generated/graphql';
import type { CounterpartySortParameter } from './counterpartyPortalAccess';
import {
    fetchActiveDiscountCountsByCustomer,
    fetchCreditByCounterpartyId,
    fetchCustomersPage,
    fetchLastOrderDatesByCounterpartyId,
    type CustomerCredit,
    type CustomerListItem,
} from './customers';
import { CUSTOMERS_FILTER_COLUMNS, conditionsToCustomersFilter } from './customersFilter';
import { mergeFilters } from './orders-filter';

export type CustomersView = 'all' | 'active' | 'inactive';
export const CUSTOMERS_VIEWS: { key: CustomersView; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
];

export interface CustomersListFilters {
    // Matches the company name and INN on the server.
    search: string;
    view: CustomersView;
    // Toolbar Filter builder, ANDed with the view.
    conditions: FilterCondition[];
}

export type CustomersSortField = keyof CounterpartySortParameter;
export interface CustomersSort {
    field: CustomersSortField;
    dir: 'ASC' | 'DESC';
}
export const DEFAULT_CUSTOMERS_SORT: CustomersSort = { field: 'shortName', dir: 'ASC' };
export const CUSTOMERS_SORT_FIELDS: CustomersSortField[] = [
    'shortName',
    'inn',
    'managerErpId',
    'phone',
    'officialEmail',
];

export const BLANK_CUSTOMERS_FILTERS: CustomersListFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export function isCustomersView(value: unknown): value is CustomersView {
    return CUSTOMERS_VIEWS.some(v => v.key === value);
}

// Rebuilds list filters from a stored view; anything missing or of the wrong type falls back to blank.
export function restoreCustomersFilters(raw: unknown): CustomersListFilters {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
        search: typeof r.search === 'string' ? r.search : '',
        view: isCustomersView(r.view) ? r.view : 'all',
        conditions: sanitizeConditions(r.conditions, CUSTOMERS_FILTER_COLUMNS),
    };
}

// A fixed filter (the customer card's nested list) narrows beside the builder, never replaces it.
export function customersListFilter(
    filters: CustomersListFilters,
    fixed?: CounterpartyFilterParameter,
): CounterpartyFilterParameter | undefined {
    const own = conditionsToCustomersFilter(filters.conditions);
    if (!fixed) return own;
    return mergeFilters(fixed, own ?? {}) as CounterpartyFilterParameter;
}

export interface CustomersPageResult {
    items: CustomerListItem[];
    totalItems: number;
    credit: Map<string, CustomerCredit>;
    discountCounts: Map<string, number>;
    lastOrderDates: Map<string, string>;
}

export async function fetchCustomersList(
    filters: CustomersListFilters,
    fixed: CounterpartyFilterParameter | undefined,
    page: number,
    pageSize: number,
    sort: CustomersSort,
): Promise<CustomersPageResult> {
    const options = {
        take: pageSize,
        skip: (page - 1) * pageSize,
        search: filters.search.trim() || undefined,
        status: filters.view === 'all' ? undefined : filters.view,
        filter: customersListFilter(filters, fixed),
        sort: { [sort.field]: sort.dir },
    };
    const [result, credit] = await Promise.all([
        fetchCustomersPage(options),
        fetchCreditByCounterpartyId(options),
    ]);
    const ids = result.items.map(c => c.id);
    const [discountCounts, lastOrderDates] = await Promise.all([
        fetchActiveDiscountCountsByCustomer(ids),
        fetchLastOrderDatesByCounterpartyId(ids),
    ]);
    return { ...result, credit, discountCounts, lastOrderDates };
}

export type CustomersViewCounts = Record<CustomersView, number>;

// A take:0 COUNT per chip in one request, each narrowed by the same search and builder conditions.
export async function fetchCustomersViewCounts(
    filters: CustomersListFilters,
    fixed?: CounterpartyFilterParameter,
): Promise<CustomersViewCounts> {
    const base = {
        take: 0,
        search: filters.search.trim() || undefined,
        filter: customersListFilter(filters, fixed),
    };
    const result = await adminApi(CustomersViewCountsDocument, {
        all: base,
        active: { ...base, status: 'active' },
        inactive: { ...base, status: 'inactive' },
    });
    return {
        all: result.all.totalItems,
        active: result.active.totalItems,
        inactive: result.inactive.totalItems,
    };
}
