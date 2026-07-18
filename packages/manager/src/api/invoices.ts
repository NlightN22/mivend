import { adminApi } from './client';

export interface InvoiceListItem {
    id: string;
    orderId: string;
    counterpartyId: string;
    amount: number;
    currencyCode: string;
    status: string;
    branchId: string | null;
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

const INVOICE_ITEM_FIELDS = `
    id
    orderId
    counterpartyId
    amount
    currencyCode
    status
    branchId
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

export async function fetchInvoicesForCounterparty(
    counterpartyId: string,
    take = 20,
): Promise<InvoiceListItem[]> {
    const result = await adminApi<{
        visibleInvoices: { items: InvoiceListItem[] };
    }>(
        `query InvoicesForCounterparty($counterpartyId: ID!, $take: Int!) {
            visibleInvoices(options: { take: $take }, counterpartyId: $counterpartyId) {
                items { ${INVOICE_ITEM_FIELDS} }
            }
        }`,
        { counterpartyId, take },
    );
    return result.visibleInvoices.items;
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
