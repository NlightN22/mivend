import { computed, inject, type ComputedRef } from 'vue';
import { UI_LOCALE_KEY } from './uiLocale';

// The injected locale when an app provides one, else the component's historical default.
export function useUiFormatLocale(fallback: string | undefined): ComputedRef<string | undefined> {
    const provided = inject(UI_LOCALE_KEY, null);
    return computed(() => provided?.value ?? fallback);
}

export function currencySymbol(currencyCode: string, locale: string | undefined): string {
    const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
    }).formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value ?? currencyCode;
}
