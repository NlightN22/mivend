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
    type CustomerCredit,
    type CustomerListItem,
} from './customers';
import { CUSTOMERS_FILTER_COLUMNS, conditionsToCustomersFilter } from './customersFilter';
import { mergeFilters } from './orders-filter';

export type CustomersView = 'all' | 'none' | 'invited' | 'verified' | 'active';
export const CUSTOMERS_VIEWS: { key: CustomersView; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'none', label: 'Not activated' },
    { key: 'invited', label: 'Invited' },
    { key: 'verified', label: 'Verified' },
    { key: 'active', label: 'Active' },
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
    'creditLimit',
    'creditBalance',
    'lastOrderAt',
    'portalState',
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

export function viewFilter(
    view: CustomersView,
    filter: CounterpartyFilterParameter | undefined,
): CounterpartyFilterParameter | undefined {
    if (view === 'all') return filter;
    return mergeFilters(filter ?? {}, {
        portalState: { eq: view },
    }) as CounterpartyFilterParameter;
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
        filter: viewFilter(filters.view, customersListFilter(filters, fixed)),
        sort: { [sort.field]: sort.dir },
    };
    const [result, credit] = await Promise.all([
        fetchCustomersPage(options),
        fetchCreditByCounterpartyId(options),
    ]);
    const discountCounts = await fetchActiveDiscountCountsByCustomer(result.items.map(c => c.id));
    return { ...result, credit, discountCounts };
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
    };
    const filter = customersListFilter(filters, fixed);
    const options = (
        view: CustomersView,
    ): { take: number; search?: string; filter?: CounterpartyFilterParameter } => ({
        ...base,
        filter: viewFilter(view, filter),
    });
    const result = await adminApi(CustomersViewCountsDocument, {
        all: options('all'),
        none: options('none'),
        invited: options('invited'),
        verified: options('verified'),
        active: options('active'),
    });
    return {
        all: result.all.totalItems,
        none: result.none.totalItems,
        invited: result.invited.totalItems,
        verified: result.verified.totalItems,
        active: result.active.totalItems,
    };
}
