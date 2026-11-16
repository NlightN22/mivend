import { createI18n } from 'vue-i18n';
import en from './en';
import {
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    loadCatalogue,
    matchLocale,
    resolveLocale,
    type MessageSchema,
} from './locales';

const STORAGE_KEY = 'mivend.locale';
const SETTINGS_DEFAULT_TIMEOUT_MS = 1500;

function slavicPlural(choice: number): number {
    const n = Math.abs(choice) % 100;
    if (n >= 11 && n <= 14) return 2;
    if (n % 10 === 1) return 0;
    return n % 10 >= 2 && n % 10 <= 4 ? 1 : 2;
}

export const i18n = createI18n<[MessageSchema], string, false>({
    legacy: false,
    locale: DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    messages: { [DEFAULT_LOCALE]: en },
    pluralRules: { ru: slavicPlural },
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

let latestRequest = 0;

async function applyLocale(locale: string): Promise<boolean> {
    const request = ++latestRequest;
    if (!i18n.global.availableLocales.includes(locale)) {
        i18n.global.setLocaleMessage(locale, await loadCatalogue(locale));
    }
    if (request !== latestRequest) return false;
    i18n.global.locale.value = locale;
    document.documentElement.lang = locale;
    return true;
}

export async function setLocale(locale: string): Promise<void> {
    if (await applyLocale(locale)) saveLocale(locale);
}

function fetchWithTimeout(fetchDefault: () => Promise<string | null>): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), SETTINGS_DEFAULT_TIMEOUT_MS);
    });
    return Promise.race([fetchDefault().catch(() => null), timeout]).finally(() =>
        clearTimeout(timer),
    );
}

export async function initLocale(
    fetchSettingsDefault: () => Promise<string | null>,
): Promise<void> {
    const saved = readSavedLocale();
    const matched = matchLocale(saved, navigator.languages, SUPPORTED_LOCALES);
    const settingsDefault = matched ? null : await fetchWithTimeout(fetchSettingsDefault);
    await applyLocale(
        resolveLocale(saved, navigator.languages, SUPPORTED_LOCALES, settingsDefault),
    );
}
