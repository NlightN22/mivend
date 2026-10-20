import { formatDate as formatLocaleDate } from '../../i18n/format';

export { formatMoney as formatAmount } from '../proforma-invoices/formatMoney';

export function formatDate(iso: string): string {
    return formatLocaleDate(iso, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function orderDisplayNumber(order: {
    code: string;
    customFields?: {
        isExternal?: boolean | null;
        erpRegistrationDocumentNumber?: string | null;
    } | null;
}): string {
    const erpNumber = order.customFields?.erpRegistrationDocumentNumber;
    return order.customFields?.isExternal === true && erpNumber ? erpNumber : order.code;
}
