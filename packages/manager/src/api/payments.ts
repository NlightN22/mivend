import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';

export interface PaymentListItem {
    id: string;
    channel: string;
    paymentStatus: string;
    amount: number;
    currencyCode: string;
    invoiceId: string | null;
    // Only populated by visiblePayments (joined from the payment's Invoice server-side) — see
    // PaymentVisibilityService.findVisible.
    counterpartyId: string | null;
}

export interface PaymentFilters {
    // Index signature lets PaymentFilters satisfy useUrlSyncedState's generic Record<string,
    // string> constraint — mirrors api/orders.ts's OrdersFilters.
    [key: string]: string;
    status: string;
    channel: string;
    counterpartyId: string;
}

export const DEFAULT_PAYMENT_FILTERS: PaymentFilters = {
    status: '',
    channel: '',
    counterpartyId: '',
};

// PaymentAttempt.paymentStatus is a fixed internal state machine, not ERP-sourced business
// data — same carve-out as api/orders.ts's ORDER_STATE_OPTIONS.
export const PAYMENT_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'authorized', label: 'Authorized' },
    { value: 'captured', label: 'Captured' },
    { value: 'failed', label: 'Failed' },
    { value: 'canceled', label: 'Canceled' },
    { value: 'partiallyRefunded', label: 'Partially refunded' },
    { value: 'refunded', label: 'Refunded' },
    { value: 'disputed', label: 'Disputed' },
    { value: 'chargeback', label: 'Chargeback' },
] as const;

// Single source of truth for the PaymentAttempt status badge color (AGENTS.md ui-kit "single
// source of truth" rule) — mirrors api/orders.ts's ORDER_STATE_BADGE_VARIANT. Real incident this
// fixes: PaymentsTable.vue rendered every status badge with no variant at all (always the
// default gray), found in the same table-consistency audit that flagged InvoicesTable.vue's
// identical bug.
export const PAYMENT_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    pending: 'warning',
    authorized: 'info',
    captured: 'success',
    failed: 'danger',
    canceled: 'neutral',
    partiallyRefunded: 'warning',
    refunded: 'neutral',
    disputed: 'danger',
    chargeback: 'danger',
};

export const PAYMENT_CHANNEL_OPTIONS = [
    { value: '', label: 'All sources' },
    { value: 'online-acquiring', label: 'Online' },
    { value: 'branch-kassa', label: 'Branch kassa' },
    { value: 'bank-transfer-erp', label: 'Bank transfer (ERP)' },
] as const;

const PAYMENT_ITEM_FIELDS = `
    id
    channel
    paymentStatus
    amount
    currencyCode
    invoiceId
    counterpartyId
`;

export async function fetchPaymentsPage(
    filters: PaymentFilters,
    page: number,
    pageSize: number,
): Promise<{ items: PaymentListItem[]; totalItems: number }> {
    const result = await adminApi<{
        visiblePayments: { items: PaymentListItem[]; totalItems: number };
    }>(
        `query PaymentsPage($options: PaymentListOptions, $counterpartyId: ID) {
            visiblePayments(options: $options, counterpartyId: $counterpartyId) {
                totalItems
                items { ${PAYMENT_ITEM_FIELDS} }
            }
        }`,
        {
            options: {
                skip: (page - 1) * pageSize,
                take: pageSize,
                status: filters.status || undefined,
                channel: filters.channel || undefined,
            },
            counterpartyId: filters.counterpartyId || undefined,
        },
    );
    return result.visiblePayments;
}
