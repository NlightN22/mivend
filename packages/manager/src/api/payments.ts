import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    PaymentsPageDocument,
    PaymentViewCountsDocument,
    type PaymentListItemFieldsFragment,
} from './generated/graphql';

export type PaymentListItem = PaymentListItemFieldsFragment;

export interface PaymentFilters {
    // Index signature lets PaymentFilters satisfy useUrlSyncedState's generic Record<string,
    // string> constraint — mirrors api/orders.ts's OrdersFilters.
    [key: string]: string;
    status: string;
    channel: string;
    search: string;
    counterpartyId: string;
}

export const DEFAULT_PAYMENT_FILTERS: PaymentFilters = {
    status: '',
    channel: '',
    search: '',
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

// Single source of truth for PaymentAttempt status badge variants; mirrors
// ORDER_STATE_BADGE_VARIANT in api/orders.ts. Keep the two in sync.
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

export interface PaymentViewCounts {
    all: number;
    captured: number;
    pending: number;
    failed: number;
    refunded: number;
}

// Counts use take: 0 (real COUNT, no rows), batched in one round trip via GraphQL aliases.
// Only 5 chips on purpose; the rest use the column filter. Sync CustomerPaymentsTab.vue VIEWS.
export async function fetchPaymentViewCounts(counterpartyId: string): Promise<PaymentViewCounts> {
    const result = await adminApi(PaymentViewCountsDocument, { counterpartyId });
    return {
        all: result.all.totalItems,
        captured: result.captured.totalItems,
        pending: result.pending.totalItems,
        failed: result.failed.totalItems,
        refunded: result.refunded.totalItems,
    };
}

export async function fetchPaymentsPage(
    filters: PaymentFilters,
    page: number,
    pageSize: number,
): Promise<{ items: PaymentListItem[]; totalItems: number }> {
    const result = await adminApi(PaymentsPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            status: filters.status || undefined,
            channel: filters.channel || undefined,
            search: filters.search || undefined,
        },
        counterpartyId: filters.counterpartyId || undefined,
    });
    return result.visiblePayments;
}
