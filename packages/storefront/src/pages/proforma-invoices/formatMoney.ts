import { formatMoney as formatLocaleMoney } from '../../i18n/format';

export function formatMoney(cents: number, currency: string): string {
    return formatLocaleMoney(cents / 100, currency);
}
