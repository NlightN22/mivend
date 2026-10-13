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

// User-facing ProformaInvoice.displayStatus (a fixed internal state machine, not ERP-sourced business data —
// same carve-out as api/orders.ts's ORDER_STATE_OPTIONS). A proforma invoice is never shown as paid.
export const PROFORMA_INVOICE_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'current', label: 'Current' },
    { value: 'superseded', label: 'Superseded' },
    { value: 'cancelled', label: 'Cancelled' },
] as const;

export const PROFORMA_INVOICE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
    PROFORMA_INVOICE_STATUS_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]),
);

// Single source of truth for the ProformaInvoice status badge color (the frontend-rules skill's ui-kit "single source of
// truth" rule) — mirrors api/orders.ts's ORDER_STATE_BADGE_VARIANT. Real incident this fixes:
// ProformaInvoicesTable.vue rendered every status badge with no variant at all (always the default
// gray), found in the same table-consistency audit that flagged PaymentsTable.vue's identical bug.
export const PROFORMA_INVOICE_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    current: 'success',
    superseded: 'neutral',
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
    current: number;
    superseded: number;
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
        current: result.current.totalItems,
        superseded: result.superseded.totalItems,
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
