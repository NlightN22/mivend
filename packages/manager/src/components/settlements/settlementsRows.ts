import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { SETTLEMENT_CATEGORY_VARIANT, type SettlementListItem } from '../../api/settlements';

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
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        signDisplay: 'exceptZero',
    }).format(minor / 100);
}

export function toSettlementRows(items: SettlementListItem[]): SettlementRow[] {
    return items.map(item => ({
        id: item.id,
        number: item.number,
        date: item.date,
        counterpartyId: item.counterpartyId ?? '',
        customer: item.counterpartyShortName ?? '—',
        type: item.documentTypeLabel,
        typeVariant: SETTLEMENT_CATEGORY_VARIANT[item.category] ?? 'neutral',
        contract: item.contractName ?? '—',
        organization: item.organizationName ?? '—',
        orderCodes: item.orderCodes,
        proformaInvoice: item.proformaInvoiceNumber ?? '',
        amount: formatSettlementAmount(item.amount, item.currencyCode),
    }));
}
