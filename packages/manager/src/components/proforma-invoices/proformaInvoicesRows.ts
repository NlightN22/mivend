import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    PROFORMA_INVOICE_STATUS_LABEL,
    type ProformaInvoiceListItem,
} from '../../api/proforma-invoices';

export type ProformaInvoiceRow = {
    id: string;
    number: string;
    version: number;
    createdAt: string;
    customer: string;
    orderCode: string;
    status: string;
    statusVariant: StatusBadgeVariant;
    amount: string;
    dueDate: string;
};

export function toProformaInvoiceRows(items: ProformaInvoiceListItem[]): ProformaInvoiceRow[] {
    return items.map(item => ({
        id: item.id,
        number: item.number,
        version: item.version,
        createdAt: item.createdAt,
        customer: item.counterpartyShortName ?? '—',
        orderCode: item.order?.code ?? '',
        status: PROFORMA_INVOICE_STATUS_LABEL[item.displayStatus] ?? item.displayStatus,
        statusVariant: PROFORMA_INVOICE_STATUS_BADGE_VARIANT[item.displayStatus] ?? 'neutral',
        amount: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: item.currencyCode,
        }).format(item.amount / 100),
        dueDate: new Date(item.dueDate).toLocaleDateString('en-US'),
    }));
}
