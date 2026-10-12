import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    ProformaInvoiceOutstandingBalanceDocument,
    ProformaInvoicesPageDocument,
    ProformaInvoiceViewCountsDocument,
    type ProformaInvoiceListItemFieldsFragment,
} from './generated/graphql';

export type ProformaInvoiceListItem = ProformaInvoiceListItemFieldsFragment;

export interface ProformaInvoiceFilters {
    // Index signature lets ProformaInvoiceFilters satisfy useUrlSyncedState's generic Record<string,
    // string> constraint — mirrors api/orders.ts's OrdersFilters.
    [key: string]: string;
    status: string;
    counterpartyId: string;
    // Substring match against the proforma invoice's own number (ProformaInvoiceListItem.number).
    search: string;
}

export const DEFAULT_PROFORMA_INVOICE_FILTERS: ProformaInvoiceFilters = {
    status: '',
    counterpartyId: '',
    search: '',
};

// ProformaInvoice.status is a fixed internal state machine (plugin-acquiring's ProformaInvoiceStatus), not
// ERP-sourced business data — same carve-out as api/orders.ts's ORDER_STATE_OPTIONS.
export const PROFORMA_INVOICE_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'issued', label: 'Issued' },
    { value: 'paid', label: 'Paid' },
    { value: 'cancelled', label: 'Cancelled' },
] as const;

// Single source of truth for the ProformaInvoice status badge color (the frontend-rules skill's ui-kit "single source of
// truth" rule) — mirrors api/orders.ts's ORDER_STATE_BADGE_VARIANT. Real incident this fixes:
// ProformaInvoicesTable.vue rendered every status badge with no variant at all (always the default
// gray), found in the same table-consistency audit that flagged PaymentsTable.vue's identical bug.
export const PROFORMA_INVOICE_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    pending: 'warning',
    issued: 'info',
    paid: 'success',
    cancelled: 'danger',
};

export async function fetchProformaInvoicesPage(
    filters: ProformaInvoiceFilters,
    page: number,
    pageSize: number,
): Promise<{ items: ProformaInvoiceListItem[]; totalItems: number }> {
    const result = await adminApi(ProformaInvoicesPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            status: filters.status || undefined,
            search: filters.search || undefined,
        },
        counterpartyId: filters.counterpartyId || undefined,
    });
    return result.visibleProformaInvoices;
}

export interface ProformaInvoiceViewCounts {
    all: number;
    pending: number;
    issued: number;
    paid: number;
    cancelled: number;
}

// Real COUNT per status chip (take: 0 — no row data) — mirrors
// api/customers.ts's fetchCustomerOrderViewCounts, so chip counts reflect the whole visible set,
// not just the currently-loaded page.
export async function fetchProformaInvoiceViewCounts(
    counterpartyId: string,
): Promise<ProformaInvoiceViewCounts> {
    const result = await adminApi(ProformaInvoiceViewCountsDocument, { counterpartyId });
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
    const result = await adminApi(ProformaInvoiceOutstandingBalanceDocument, { counterpartyId });
    return result.proformaInvoiceOutstandingBalance ?? null;
}
