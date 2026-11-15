import { moneyTag } from '../../i18n/format';
import type { ErpDocumentRow } from '../../api/erpDocumentsList';

export type ErpDocumentTableRow = {
    id: string;
    number: string;
    date: string;
    counterpartyId: string;
    customer: string;
    orderCode: string;
    products: string;
    moreProducts: number;
    contract: string;
    organization: string;
    comment: string;
    amount: string;
};

// Only an alphabetic code is shown; anything else the ERP sent as the currency is not a label.
export function formatErpDocumentAmount(minor: number, currency: string | null): string {
    const value = new Intl.NumberFormat(moneyTag(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(minor / 100);
    return currency && /^[A-Za-z]{3}$/.test(currency)
        ? `${value} ${currency.toUpperCase()}`
        : value;
}

export function toErpDocumentRows(items: ErpDocumentRow[]): ErpDocumentTableRow[] {
    return items.map(item => ({
        id: item.id,
        number: item.number,
        date: item.date ?? '',
        counterpartyId: item.counterpartyId ?? '',
        customer: item.counterpartyName ?? '—',
        orderCode: item.orderCode ?? '',
        products: item.productNames.join(', '),
        moreProducts: Math.max(item.lineCount - item.productNames.length, 0),
        contract: item.contractName ?? '—',
        organization: item.organizationName ?? '—',
        comment: item.comment ?? '',
        amount: formatErpDocumentAmount(item.amount, item.currency),
    }));
}
