import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { i18n } from '../i18n';
import { adminApi } from './client';
import {
    PaymentCardDocument,
    PaymentsPageDocument,
    PaymentViewCountsDocument,
    type PaymentFilterParameter,
    type PaymentCardQuery,
    type PaymentListItemFieldsFragment,
} from './generated/graphql';
import { formatMoney } from '../i18n/format';

// Labels resolve on read so a language switch reaches module-level option lists.
function lazyOptions(
    prefix: string,
    values: readonly string[],
): { value: string; readonly label: string }[] {
    return values.map(value => ({
        value,
        get label(): string {
            return i18n.global.t(`${prefix}.${value || 'any'}`);
        },
    }));
}

export type PaymentListItem = PaymentListItemFieldsFragment;
export type PaymentCardData = NonNullable<PaymentCardQuery['payment']>;

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
export const PAYMENT_STATUS_OPTIONS = lazyOptions('payments.status', [
    '',
    'pending',
    'authorized',
    'captured',
    'failed',
    'canceled',
    'partiallyRefunded',
    'refunded',
    'disputed',
    'chargeback',
]);

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

export const PAYMENT_CHANNEL_OPTIONS = lazyOptions('payments.channel', [
    '',
    'online-acquiring',
    'branch-kassa',
    'bank-transfer-erp',
]);

export interface PaymentViewCounts {
    all: number;
    captured: number;
    pending: number;
    failed: number;
    refunded: number;
}

// Counts use take: 0 (real COUNT, no rows), batched in one round trip via GraphQL aliases.
// Only 5 chips on purpose; the rest use the column filter.
export async function fetchPaymentViewCounts(
    counterpartyId: string,
    search?: string,
    filter?: PaymentFilterParameter,
): Promise<PaymentViewCounts> {
    const result = await adminApi(PaymentViewCountsDocument, {
        counterpartyId: counterpartyId || undefined,
        search: search || undefined,
        filter,
    });
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

export function formatPaymentAmount(amount: number, currencyCode: string): string {
    return formatMoney(amount, currencyCode);
}

// The server returns null for a foreign, unknown or malformed id.
export async function fetchPaymentCard(id: string): Promise<PaymentCardData | null> {
    const result = await adminApi(PaymentCardDocument, { id });
    return result.payment;
}
