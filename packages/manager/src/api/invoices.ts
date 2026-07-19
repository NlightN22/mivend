import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';

export interface InvoiceListItem {
    id: string;
    orderId: string;
    counterpartyId: string;
    amount: number;
    currencyCode: string;
    status: string;
    branchId: string | null;
    order: { code: string };
}

export interface InvoiceFilters {
    // Index signature lets InvoiceFilters satisfy useUrlSyncedState's generic Record<string,
    // string> constraint — mirrors api/orders.ts's OrdersFilters.
    [key: string]: string;
    status: string;
    counterpartyId: string;
}

export const DEFAULT_INVOICE_FILTERS: InvoiceFilters = {
    status: '',
    counterpartyId: '',
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

// Single source of truth for the Invoice status badge color (AGENTS.md ui-kit "single source of
// truth" rule) — mirrors api/orders.ts's ORDER_STATE_BADGE_VARIANT. Real incident this fixes:
// InvoicesTable.vue rendered every status badge with no variant at all (always the default
// gray), found in the same table-consistency audit that flagged PaymentsTable.vue's identical bug.
export const INVOICE_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    pending: 'warning',
    issued: 'info',
    paid: 'success',
    cancelled: 'danger',
};

const INVOICE_ITEM_FIELDS = `
    id
    orderId
    counterpartyId
    amount
    currencyCode
    status
    branchId
    order { code }
`;

export async function fetchInvoicesPage(
    filters: InvoiceFilters,
    page: number,
    pageSize: number,
): Promise<{ items: InvoiceListItem[]; totalItems: number }> {
    const result = await adminApi<{
        visibleInvoices: { items: InvoiceListItem[]; totalItems: number };
    }>(
        `query InvoicesPage($options: InvoiceListOptions, $counterpartyId: ID) {
            visibleInvoices(options: $options, counterpartyId: $counterpartyId) {
                totalItems
                items { ${INVOICE_ITEM_FIELDS} }
            }
        }`,
        {
            options: {
                skip: (page - 1) * pageSize,
                take: pageSize,
                status: filters.status || undefined,
            },
            counterpartyId: filters.counterpartyId || undefined,
        },
    );
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
    const result = await adminApi<{
        all: { totalItems: number };
        pending: { totalItems: number };
        issued: { totalItems: number };
        paid: { totalItems: number };
        cancelled: { totalItems: number };
    }>(
        `query InvoiceViewCounts($counterpartyId: ID) {
            all: visibleInvoices(options: { take: 0 }, counterpartyId: $counterpartyId) { totalItems }
            pending: visibleInvoices(options: { take: 0, status: "pending" }, counterpartyId: $counterpartyId) { totalItems }
            issued: visibleInvoices(options: { take: 0, status: "issued" }, counterpartyId: $counterpartyId) { totalItems }
            paid: visibleInvoices(options: { take: 0, status: "paid" }, counterpartyId: $counterpartyId) { totalItems }
            cancelled: visibleInvoices(options: { take: 0, status: "cancelled" }, counterpartyId: $counterpartyId) { totalItems }
        }`,
        { counterpartyId },
    );
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
    const result = await adminApi<{ invoiceOutstandingBalance: OutstandingBalance | null }>(
        `query($counterpartyId: ID!) {
            invoiceOutstandingBalance(counterpartyId: $counterpartyId) { amount currencyCode }
        }`,
        { counterpartyId },
    );
    return result.invoiceOutstandingBalance;
}
