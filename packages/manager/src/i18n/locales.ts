import type en from './en';

export type MessageSchema = typeof en;

export const DEFAULT_LOCALE = 'en';

const catalogueLoaders = import.meta.glob<{ default: MessageSchema }>('./*/index.ts');

export const SUPPORTED_LOCALES: string[] = Object.keys(catalogueLoaders).map(
    path => path.split('/')[1],
);

const REGIONAL_TAGS: Record<string, string> = { en: 'en-GB' };

export function regionalTag(locale: string): string {
    return REGIONAL_TAGS[locale] ?? locale;
}

export function flagRegion(locale: string): string {
    return (new Intl.Locale(regionalTag(locale)).maximize().region ?? '').toLowerCase();
}

export function nativeName(locale: string): string {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

export function loadCatalogue(locale: string): Promise<MessageSchema> {
    return catalogueLoaders[`./${locale}/index.ts`]().then(module => module.default);
}

export function resolveLocale(
    saved: string | null,
    browserLanguages: readonly string[],
    supported: readonly string[],
): string {
    if (saved && supported.includes(saved)) return saved;
    for (const tag of browserLanguages) {
        const language = tag.toLowerCase().split('-')[0];
        if (supported.includes(language)) return language;
    }
    return DEFAULT_LOCALE;
}
