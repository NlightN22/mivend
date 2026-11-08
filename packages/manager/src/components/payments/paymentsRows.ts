import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    PAYMENT_CHANNEL_OPTIONS,
    PAYMENT_STATUS_BADGE_VARIANT,
    PAYMENT_STATUS_OPTIONS,
    formatPaymentAmount,
    type PaymentListItem,
} from '../../api/payments';

export type PaymentRow = {
    id: string;
    number: string;
    createdAt: string;
    counterpartyId: string;
    customer: string;
    proformaInvoice: string;
    orderCode: string;
    channel: string;
    status: string;
    statusVariant: StatusBadgeVariant;
    amount: string;
};

const labelOf = (options: readonly { value: string; label: string }[]): Map<string, string> =>
    new Map(options.map(o => [o.value, o.label]));
const CHANNEL_LABEL = labelOf(PAYMENT_CHANNEL_OPTIONS);
const STATUS_LABEL = labelOf(PAYMENT_STATUS_OPTIONS);

export function toPaymentRows(items: PaymentListItem[]): PaymentRow[] {
    return items.map(item => ({
        id: item.id,
        number: item.number,
        createdAt: item.createdAt,
        counterpartyId: item.counterpartyId ?? '',
        customer: item.counterpartyShortName ?? '—',
        proformaInvoice: item.proformaInvoiceNumber ?? '',
        orderCode: item.orderCode ?? '',
        channel: CHANNEL_LABEL.get(item.channel) ?? item.channel,
        status: STATUS_LABEL.get(item.paymentStatus) ?? item.paymentStatus,
        statusVariant: PAYMENT_STATUS_BADGE_VARIANT[item.paymentStatus] ?? 'neutral',
        amount: formatPaymentAmount(item.amount, item.currencyCode),
    }));
}
