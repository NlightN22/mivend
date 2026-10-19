import { createI18n } from 'vue-i18n';
import en from './en';
import {
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    loadCatalogue,
    resolveLocale,
    type MessageSchema,
} from './locales';

const STORAGE_KEY = 'mivend.locale';

export const i18n = createI18n<[MessageSchema], string, false>({
    legacy: false,
    locale: DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    messages: { [DEFAULT_LOCALE]: en },
});

function readSavedLocale(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function saveLocale(locale: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, locale);
    } catch {
        return;
    }
}

async function applyLocale(locale: string): Promise<void> {
    if (!i18n.global.availableLocales.includes(locale)) {
        i18n.global.setLocaleMessage(locale, await loadCatalogue(locale));
    }
    i18n.global.locale.value = locale;
    document.documentElement.lang = locale;
}

export async function setLocale(locale: string): Promise<void> {
    await applyLocale(locale);
    saveLocale(locale);
}

export function initLocale(): Promise<void> {
    return applyLocale(resolveLocale(readSavedLocale(), navigator.languages, SUPPORTED_LOCALES));
}
