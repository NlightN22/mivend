import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    sanitizeConditions,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { adminApi } from './client';
import { PaymentsPageDocument, type PaymentSortParameter } from './generated/graphql';
import { PAYMENTS_FILTER_COLUMNS, conditionsToPaymentsFilter } from './paymentsFilter';
import { PAYMENT_STATUS_BADGE_VARIANT, type PaymentListItem } from './payments';

export type PaymentsView = 'all' | 'captured' | 'pending' | 'failed' | 'refunded';

// Mirrors the chips of the customer card's payments tab.
export const PAYMENTS_VIEWS: { key: PaymentsView; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'captured', label: 'Captured' },
    { key: 'pending', label: 'Pending' },
    { key: 'failed', label: 'Failed' },
    { key: 'refunded', label: 'Refunded' },
];

// Same colors as the row status badges the view stands for.
export const PAYMENTS_VIEW_VARIANT: Partial<Record<PaymentsView, StatusBadgeVariant>> = {
    captured: PAYMENT_STATUS_BADGE_VARIANT.captured,
    pending: PAYMENT_STATUS_BADGE_VARIANT.pending,
    failed: PAYMENT_STATUS_BADGE_VARIANT.failed,
    refunded: PAYMENT_STATUS_BADGE_VARIANT.refunded,
};

export interface PaymentsListFilters {
    // Matches the payment number, the customer name and its INN on the server.
    search: string;
    view: PaymentsView;
    // Toolbar Filter builder, ANDed with the view.
    conditions: FilterCondition[];
}

export type PaymentsSortField = keyof PaymentSortParameter;
export interface PaymentsSort {
    field: PaymentsSortField;
    dir: 'ASC' | 'DESC';
}
export const DEFAULT_PAYMENTS_SORT: PaymentsSort = {
    field: 'createdAt',
    dir: 'DESC',
};
export const PAYMENTS_SORT_FIELDS: PaymentsSortField[] = [
    'number',
    'createdAt',
    'amount',
    'status',
    'channel',
    'customer',
];

export const BLANK_PAYMENTS_FILTERS: PaymentsListFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export function isPaymentsView(value: unknown): value is PaymentsView {
    return PAYMENTS_VIEWS.some(v => v.key === value);
}

// Rebuilds list filters from a stored view; anything missing or of the wrong type falls back to blank.
export function restorePaymentsFilters(raw: unknown): PaymentsListFilters {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
        search: typeof r.search === 'string' ? r.search : '',
        view: isPaymentsView(r.view) ? r.view : 'all',
        conditions: sanitizeConditions(r.conditions, PAYMENTS_FILTER_COLUMNS),
    };
}

export async function fetchPaymentsList(
    filters: PaymentsListFilters,
    counterpartyId: string,
    page: number,
    pageSize: number,
    sort: PaymentsSort,
): Promise<{ items: PaymentListItem[]; totalItems: number }> {
    const result = await adminApi(PaymentsPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            status: filters.view === 'all' ? undefined : filters.view,
            search: filters.search || undefined,
            filter: conditionsToPaymentsFilter(filters.conditions),
            sort: { [sort.field]: sort.dir },
        },
        counterpartyId: counterpartyId || undefined,
    });
    return result.visiblePayments;
}
