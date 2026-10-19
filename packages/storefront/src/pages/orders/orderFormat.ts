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
