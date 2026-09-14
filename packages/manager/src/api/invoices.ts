import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    InvoiceOutstandingBalanceDocument,
    InvoicesPageDocument,
    InvoiceViewCountsDocument,
    type InvoiceListItemFieldsFragment,
} from './generated/graphql';

export type InvoiceListItem = InvoiceListItemFieldsFragment;

export interface InvoiceFilters {
    // Index signature lets InvoiceFilters satisfy useUrlSyncedState's generic Record<string,
    // string> constraint — mirrors api/orders.ts's OrdersFilters.
    [key: string]: string;
    status: string;
    counterpartyId: string;
    // Substring match against the invoice's own number (InvoiceListItem.number).
    search: string;
}

export const DEFAULT_INVOICE_FILTERS: InvoiceFilters = {
    status: '',
    counterpartyId: '',
    search: '',
};

// Invoice.status is a fixed internal state machine (plugin-acquiring's InvoiceStatus), not
// ERP-sourced business data — same carve-out as api/orders.ts's ORDER_STATE_OPTIONS.
export const INVOICE_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'issued', label: 'Issued' },
    { value: 'paid', label: 'Paid' },
    { value: 'cancelled', label: 'Cancelled' },
] as const;

// Single source of truth for the Invoice status badge color (the frontend-rules skill's ui-kit "single source of
// truth" rule) — mirrors api/orders.ts's ORDER_STATE_BADGE_VARIANT. Real incident this fixes:
// InvoicesTable.vue rendered every status badge with no variant at all (always the default
// gray), found in the same table-consistency audit that flagged PaymentsTable.vue's identical bug.
export const INVOICE_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    pending: 'warning',
    issued: 'info',
    paid: 'success',
    cancelled: 'danger',
};

export async function fetchInvoicesPage(
    filters: InvoiceFilters,
    page: number,
    pageSize: number,
): Promise<{ items: InvoiceListItem[]; totalItems: number }> {
    const result = await adminApi(InvoicesPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            status: filters.status || undefined,
            search: filters.search || undefined,
        },
        counterpartyId: filters.counterpartyId || undefined,
    });
    return result.visibleInvoices;
}

export interface InvoiceViewCounts {
    all: number;
    pending: number;
    issued: number;
    paid: number;
    cancelled: number;
}

// Real COUNT per status chip (take: 0 — no row data) — mirrors
// api/customers.ts's fetchCustomerOrderViewCounts, so chip counts reflect the whole visible set,
// not just the currently-loaded page.
export async function fetchInvoiceViewCounts(counterpartyId: string): Promise<InvoiceViewCounts> {
    const result = await adminApi(InvoiceViewCountsDocument, { counterpartyId });
    return {
        all: result.all.totalItems,
        pending: result.pending.totalItems,
        issued: result.issued.totalItems,
        paid: result.paid.totalItems,
        cancelled: result.cancelled.totalItems,
    };
}

export interface OutstandingBalance {
    amount: number;
    currencyCode: string;
}

export async function fetchOutstandingBalance(
    counterpartyId: string,
): Promise<OutstandingBalance | null> {
    const result = await adminApi(InvoiceOutstandingBalanceDocument, { counterpartyId });
    return result.invoiceOutstandingBalance ?? null;
}
