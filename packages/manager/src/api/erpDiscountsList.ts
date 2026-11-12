import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    DiscountSetupCountsDocument,
    DiscountSetupsPageDocument,
    type DiscountSetupRowFieldsFragment,
    type DiscountSetupSortField,
} from './generated/graphql';

export type ErpDiscountItem = DiscountSetupRowFieldsFragment;
export type ErpDiscountsView =
    | 'all'
    | 'running'
    | 'expiring-soon'
    | 'upcoming'
    | 'expired'
    | 'inactive';

export const ERP_DISCOUNTS_VIEWS: { key: ErpDiscountsView; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'running', label: 'Running' },
    { key: 'expiring-soon', label: 'Expiring soon' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'expired', label: 'Expired' },
    { key: 'inactive', label: 'Inactive' },
];

// Single source for the row badges and the chips that stand for the same status.
export const ERP_DISCOUNT_STATUS_VARIANT: Record<
    Exclude<ErpDiscountsView, 'all'>,
    StatusBadgeVariant
> = {
    running: 'success',
    'expiring-soon': 'warning',
    upcoming: 'info',
    expired: 'neutral',
    inactive: 'danger',
};

export interface ErpDiscountsListFilters {
    // The server matches the document number and the visible customer names.
    search: string;
    view: ErpDiscountsView;
}

export interface ErpDiscountsSort {
    field: DiscountSetupSortField;
    dir: 'ASC' | 'DESC';
}
export const DEFAULT_ERP_DISCOUNTS_SORT: ErpDiscountsSort = { field: 'validFrom', dir: 'DESC' };
export const ERP_DISCOUNTS_SORT_FIELDS: DiscountSetupSortField[] = [
    'documentNumber',
    'validFrom',
    'validTo',
    'percent',
];

export const BLANK_ERP_DISCOUNTS_FILTERS: ErpDiscountsListFilters = { search: '', view: 'all' };

export function isErpDiscountsView(value: unknown): value is ErpDiscountsView {
    return ERP_DISCOUNTS_VIEWS.some(v => v.key === value);
}

// Rebuilds list filters from a stored view; anything missing or of the wrong type falls back to blank.
export function restoreErpDiscountsFilters(raw: unknown): ErpDiscountsListFilters {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
        search: typeof r.search === 'string' ? r.search : '',
        view: isErpDiscountsView(r.view) ? r.view : 'all',
    };
}

export interface ErpDiscountsPage {
    items: ErpDiscountItem[];
    totalItems: number;
}

export function toErpDiscountsOptions(
    filters: ErpDiscountsListFilters,
    counterpartyId: string,
    page: number,
    pageSize: number,
    sort: ErpDiscountsSort,
): {
    skip: number;
    take: number;
    status?: string;
    search?: string;
    counterpartyId?: string;
    sort: { field: DiscountSetupSortField; direction: 'ASC' | 'DESC' };
} {
    return {
        skip: (page - 1) * pageSize,
        take: pageSize,
        status: filters.view === 'all' ? undefined : filters.view,
        search: filters.search || undefined,
        counterpartyId: counterpartyId || undefined,
        sort: { field: sort.field, direction: sort.dir },
    };
}

export async function fetchErpDiscountsPage(
    filters: ErpDiscountsListFilters,
    counterpartyId: string,
    page: number,
    pageSize: number,
    sort: ErpDiscountsSort,
): Promise<ErpDiscountsPage> {
    const result = await adminApi(DiscountSetupsPageDocument, {
        options: toErpDiscountsOptions(filters, counterpartyId, page, pageSize, sort),
    });
    return result.discountSetups;
}

export type ErpDiscountsViewCounts = Record<ErpDiscountsView, number>;

// One request for every chip; the server counts take no search, so the numbers cover the whole scope.
export async function fetchErpDiscountsCounts(
    counterpartyId = '',
): Promise<ErpDiscountsViewCounts> {
    const { discountSetupCounts: c } = await adminApi(DiscountSetupCountsDocument, {
        counterpartyId: counterpartyId || undefined,
    });
    return {
        all: c.all,
        running: c.running,
        'expiring-soon': c.expiringSoon,
        upcoming: c.upcoming,
        expired: c.expired,
        inactive: c.inactive,
    };
}
