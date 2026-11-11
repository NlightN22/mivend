import type { StatusBadgeVariant } from '@mivend/ui-kit';
import type { SettlementListItem } from '../../api/settlements';
import { documentTypeVariant } from '../../utils/documentTypeVariant';

export type SettlementRow = {
    id: string;
    number: string;
    date: string;
    counterpartyId: string;
    customer: string;
    type: string;
    typeVariant: StatusBadgeVariant;
    contract: string;
    organization: string;
    orderCodes: string[];
    proformaInvoice: string;
    amount: string;
};

// Signed: a plus raises the customer's debt (a sale), a minus lowers it (a payment, a return).
export function formatSettlementAmount(minor: number, currency: string): string {
    const value = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        signDisplay: 'exceptZero',
    }).format(minor / 100);
    return `${value} ${currency}`;
}

export function toSettlementRows(items: SettlementListItem[]): SettlementRow[] {
    return items.map(item => ({
        id: item.id,
        number: item.number,
        date: item.date,
        counterpartyId: item.counterpartyId ?? '',
        customer: item.counterpartyShortName ?? '—',
        type: item.documentTypeLabel,
        typeVariant: documentTypeVariant(item.documentType),
        contract: item.contractName ?? '—',
        organization: item.organizationName ?? '—',
        orderCodes: item.orderCodes,
        proformaInvoice: item.proformaInvoiceNumber ?? '',
        amount: formatSettlementAmount(item.amount, item.currencyCode),
    }));
}
