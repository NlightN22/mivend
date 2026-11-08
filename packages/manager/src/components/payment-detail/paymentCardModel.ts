import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    PAYMENT_CHANNEL_OPTIONS,
    PAYMENT_STATUS_BADGE_VARIANT,
    PAYMENT_STATUS_OPTIONS,
    type PaymentCardData,
} from '../../api/payments';

const labelOf = (options: readonly { value: string; label: string }[], value: string): string =>
    options.find(o => o.value === value)?.label ?? value;

export const statusLabel = (status: string): string => labelOf(PAYMENT_STATUS_OPTIONS, status);
export const channelLabel = (channel: string): string => labelOf(PAYMENT_CHANNEL_OPTIONS, channel);
export const statusVariant = (status: string): StatusBadgeVariant =>
    PAYMENT_STATUS_BADGE_VARIANT[status] ?? 'neutral';

const REFUND_VARIANT: Record<string, StatusBadgeVariant> = {
    pending: 'warning',
    succeeded: 'success',
    failed: 'danger',
};
export const refundVariant = (status: string): StatusBadgeVariant =>
    REFUND_VARIANT[status] ?? 'neutral';

export function listLinkFor(payment: PaymentCardData): { path: string; query: { search: string } } {
    return { path: '/payments', query: { search: payment.number } };
}

export function proformaLinkFor(number: string): { path: string; query: { search: string } } {
    return { path: '/proforma-invoices', query: { search: number } };
}
