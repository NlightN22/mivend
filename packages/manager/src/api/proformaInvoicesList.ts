import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    sanitizeConditions,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { adminApi } from './client';
import {
    ProformaInvoicesPageDocument,
    type ProformaInvoiceSortParameter,
} from './generated/graphql';
import {
    PROFORMA_INVOICES_FILTER_COLUMNS,
    conditionsToProformaInvoicesFilter,
} from './proformaInvoicesFilter';
import {
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    type ProformaInvoiceListItem,
} from './proforma-invoices';

export type ProformaInvoicesView = 'all' | 'current' | 'superseded' | 'cancelled';

export const PROFORMA_INVOICES_VIEWS: { key: ProformaInvoicesView; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'current', label: 'Current' },
    { key: 'superseded', label: 'Superseded' },
    { key: 'cancelled', label: 'Cancelled' },
];

// Same colors as the row status badges the view stands for.
export const PROFORMA_INVOICES_VIEW_VARIANT: Partial<
    Record<ProformaInvoicesView, StatusBadgeVariant>
> = {
    current: PROFORMA_INVOICE_STATUS_BADGE_VARIANT.current,
    superseded: PROFORMA_INVOICE_STATUS_BADGE_VARIANT.superseded,
    cancelled: PROFORMA_INVOICE_STATUS_BADGE_VARIANT.cancelled,
};

export interface ProformaInvoicesListFilters {
    // Matches the number (also an order number), the customer name and its INN on the server.
    search: string;
    view: ProformaInvoicesView;
    // Toolbar Filter builder, ANDed with the view.
    conditions: FilterCondition[];
}

export type ProformaInvoicesSortField = keyof ProformaInvoiceSortParameter;
export interface ProformaInvoicesSort {
    field: ProformaInvoicesSortField;
    dir: 'ASC' | 'DESC';
}
export const DEFAULT_PROFORMA_INVOICES_SORT: ProformaInvoicesSort = {
    field: 'createdAt',
    dir: 'DESC',
};
export const PROFORMA_INVOICES_SORT_FIELDS: ProformaInvoicesSortField[] = [
    'number',
    'createdAt',
    'dueDate',
    'amount',
    'status',
    'customer',
];

export const BLANK_PROFORMA_INVOICES_FILTERS: ProformaInvoicesListFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export function isProformaInvoicesView(value: unknown): value is ProformaInvoicesView {
    return PROFORMA_INVOICES_VIEWS.some(v => v.key === value);
}

// Rebuilds list filters from a stored view; anything missing or of the wrong type falls back to blank.
export function restoreProformaInvoicesFilters(raw: unknown): ProformaInvoicesListFilters {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
        search: typeof r.search === 'string' ? r.search : '',
        view: isProformaInvoicesView(r.view) ? r.view : 'all',
        conditions: sanitizeConditions(r.conditions, PROFORMA_INVOICES_FILTER_COLUMNS),
    };
}

export async function fetchProformaInvoicesList(
    filters: ProformaInvoicesListFilters,
    counterpartyId: string,
    page: number,
    pageSize: number,
    sort: ProformaInvoicesSort,
): Promise<{ items: ProformaInvoiceListItem[]; totalItems: number }> {
    const result = await adminApi(ProformaInvoicesPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            status: filters.view === 'all' ? undefined : filters.view,
            search: filters.search || undefined,
            filter: conditionsToProformaInvoicesFilter(filters.conditions),
            sort: { [sort.field]: sort.dir },
        },
        counterpartyId: counterpartyId || undefined,
    });
    return result.visibleProformaInvoices;
}
