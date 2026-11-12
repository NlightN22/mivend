import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import { ORDER_STATE_BADGE_VARIANT, ORDER_STATE_LABEL } from '../../api/orders';
import {
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    PROFORMA_INVOICE_STATUS_LABEL,
} from '../../api/proforma-invoices';
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

export const orderStateLabel = (state: string): string => ORDER_STATE_LABEL[state] ?? state;
export const orderStateVariant = (state: string): StatusBadgeVariant =>
    ORDER_STATE_BADGE_VARIANT[state] ?? 'neutral';
export const proformaStatusLabel = (status: string): string =>
    PROFORMA_INVOICE_STATUS_LABEL[status] ?? status;
export const proformaStatusVariant = (status: string): StatusBadgeVariant =>
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT[status] ?? 'neutral';

const REFUND_STATUSES = ['pending', 'succeeded', 'failed'];
export const refundLabel = (status: string): string =>
    REFUND_STATUSES.includes(status) ? i18n.global.t(`payments.refundStatus.${status}`) : status;

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
