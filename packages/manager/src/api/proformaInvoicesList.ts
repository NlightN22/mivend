import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import { ProformaInvoicesPageDocument } from './generated/graphql';
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
}

export const BLANK_PROFORMA_INVOICES_FILTERS: ProformaInvoicesListFilters = {
    search: '',
    view: 'all',
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
    };
}

// The server orders the list by creation date, newest first; there is no client-side sorting.
export async function fetchProformaInvoicesList(
    filters: ProformaInvoicesListFilters,
    counterpartyId: string,
    page: number,
    pageSize: number,
): Promise<{ items: ProformaInvoiceListItem[]; totalItems: number }> {
    const result = await adminApi(ProformaInvoicesPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            status: filters.view === 'all' ? undefined : filters.view,
            search: filters.search || undefined,
        },
        counterpartyId: counterpartyId || undefined,
    });
    return result.visibleProformaInvoices;
}
