import { i18n } from './index';
import { regionalTag } from './locales';

function activeTag(): string {
    return regionalTag(i18n.global.locale.value);
}

export function formatNumber(
    value: number,
    options: Intl.NumberFormatOptions = {},
    locale: string = activeTag(),
): string {
    return new Intl.NumberFormat(locale, options).format(value);
}

export function formatMoney(
    amount: number,
    currency: string | null = 'RUB',
    options: Intl.NumberFormatOptions = { maximumFractionDigits: 0 },
    locale: string = activeTag(),
): string {
    const style: Intl.NumberFormatOptions = currency
        ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0 }
        : {};
    return new Intl.NumberFormat(locale, { ...style, ...options }).format(amount);
}

export function formatDate(
    value: string | number | Date,
    options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
    locale: string = activeTag(),
): string {
    return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}
