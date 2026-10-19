import { formatMoney as formatLocaleMoney } from '../../i18n/format';

export function formatMoney(cents: number, currency: string): string {
    const fractionDigits = cents % 100 === 0 ? 0 : 2;
    return formatLocaleMoney(cents / 100, currency, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
}
