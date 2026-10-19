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

// Prices are RUB-only and always show kopecks, so equal prices never render differently.
const MONEY_DIGITS: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
};

export function formatMoney(
    amount: number,
    currency: string | null = 'RUB',
    locale: string = activeTag(),
): string {
    const style: Intl.NumberFormatOptions = currency
        ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }
        : {};
    return new Intl.NumberFormat(locale, { ...style, ...MONEY_DIGITS }).format(amount);
}

export function formatDate(
    value: string | number | Date,
    options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
    locale: string = activeTag(),
): string {
    return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

export function formatAmount(amount: number, currency: string): string {
    return formatMoney(amount, currency);
}
