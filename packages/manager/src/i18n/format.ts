import { i18n } from './index';
import { regionalTag } from './locales';

export function activeTag(): string {
    return regionalTag(i18n.global.locale.value);
}

// Staff read day-first dates in every language: 13.11.2026 (ru), 13/11/2026 (en-GB).
export function formatDate(value: string | number | Date, locale: string = activeTag()): string {
    return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(value));
}

// Money keeps the en-US style in English and the ru-RU style in Russian.
export function moneyTag(locale: string = i18n.global.locale.value): string {
    return locale === 'ru' ? 'ru-RU' : 'en-US';
}

export function formatMoney(
    minor: number,
    currency: string,
    options: Intl.NumberFormatOptions = {},
    locale: string = moneyTag(),
): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, ...options }).format(
        minor / 100,
    );
}

export function formatDateTime(
    value: string | number | Date,
    locale: string = activeTag(),
): string {
    return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(value));
}
