import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    sanitizeConditions,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { i18n } from '../i18n';
import { adminApi } from './client';
import {
    DiscountRegistryPageDocument,
    DiscountViewCountsDocument,
    type DiscountRegistryFilterParameter,
    type DiscountRegistryItemFieldsFragment,
    type DiscountRegistrySortParameter,
} from './generated/graphql';
import { DISCOUNTS_FILTER_COLUMNS, conditionsToDiscountsFilter } from './discountsFilter';
import { fetchCounterpartyNames } from './customers';
import { DISCOUNT_STATUS_BADGE_VARIANT, camelKey } from './discounts';

export type DiscountRegistryItem = DiscountRegistryItemFieldsFragment;
export type DiscountsView = 'all' | 'active' | 'expiring-soon' | 'pending' | 'rejected';

// Only the operational shortcuts; Expired stays reachable through the Status filter.
export const DISCOUNTS_VIEWS: { key: DiscountsView; readonly label: string }[] = (
    ['all', 'active', 'expiring-soon', 'pending', 'rejected'] as const
).map(key => ({
    key,
    get label(): string {
        return i18n.global.t(`discounts.views.${camelKey(key)}`);
    },
}));

export const DISCOUNTS_VIEW_VARIANT: Partial<Record<DiscountsView, StatusBadgeVariant>> = {
    active: DISCOUNT_STATUS_BADGE_VARIANT.active,
    'expiring-soon': DISCOUNT_STATUS_BADGE_VARIANT['expiring-soon'],
    pending: DISCOUNT_STATUS_BADGE_VARIANT.pending,
    rejected: DISCOUNT_STATUS_BADGE_VARIANT.rejected,
};

export interface DiscountsListFilters {
    // Matches the number, price type, product group and customer names on the server.
    search: string;
    view: DiscountsView;
    // Toolbar Filter builder, ANDed with the view.
    conditions: FilterCondition[];
}

export type DiscountsSortField = keyof DiscountRegistrySortParameter;
export interface DiscountsSort {
    field: DiscountsSortField;
    dir: 'ASC' | 'DESC';
}
export const DEFAULT_DISCOUNTS_SORT: DiscountsSort = { field: 'createdAt', dir: 'DESC' };
export const DISCOUNTS_SORT_FIELDS: DiscountsSortField[] = [
    'number',
    'createdAt',
    'customer',
    'priceType',
    'productGroup',
    'percent',
    'validFrom',
    'validTo',
    'status',
];

export const BLANK_DISCOUNTS_FILTERS: DiscountsListFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export function isDiscountsView(value: unknown): value is DiscountsView {
    return DISCOUNTS_VIEWS.some(v => v.key === value);
}

// Rebuilds list filters from a stored view; anything missing or of the wrong type falls back to blank.
export function restoreDiscountsFilters(raw: unknown): DiscountsListFilters {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
        search: typeof r.search === 'string' ? r.search : '',
        view: isDiscountsView(r.view) ? r.view : 'all',
        conditions: sanitizeConditions(r.conditions, DISCOUNTS_FILTER_COLUMNS),
    };
}

export interface DiscountsPage {
    items: DiscountRegistryItem[];
    totalItems: number;
    names: Map<string, string>;
}

export async function fetchDiscountsList(
    filters: DiscountsListFilters,
    counterpartyId: string,
    page: number,
    pageSize: number,
    sort: DiscountsSort,
): Promise<DiscountsPage> {
    const result = await adminApi(DiscountRegistryPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            status: filters.view === 'all' ? undefined : filters.view,
            search: filters.search || undefined,
            counterpartyId: counterpartyId || undefined,
            filter: conditionsToDiscountsFilter(filters.conditions),
            sort: { [sort.field]: sort.dir },
        },
    });
    const { items, totalItems } = result.discountRegistryPage;
    const names = await fetchCounterpartyNames(items.flatMap(i => i.counterpartyIds ?? []));
    return { items, totalItems, names };
}

export type DiscountsViewCounts = Record<DiscountsView, number>;

// A take:0 COUNT per chip in one request, each narrowed by the same search and builder conditions.
export async function fetchDiscountViewCounts(
    search: string,
    filter?: DiscountRegistryFilterParameter,
    counterpartyId = '',
): Promise<DiscountsViewCounts> {
    const result = await adminApi(DiscountViewCountsDocument, {
        search: search || undefined,
        filter,
        counterpartyId: counterpartyId || undefined,
    });
    return {
        all: result.all.totalItems,
        active: result.active.totalItems,
        'expiring-soon': result.expiringSoon.totalItems,
        pending: result.pending.totalItems,
        rejected: result.rejected.totalItems,
    };
}
