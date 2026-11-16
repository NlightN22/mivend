export const SITE_LANGUAGES = ['en', 'ru'] as const;
export type SiteLanguage = (typeof SITE_LANGUAGES)[number];

export function asSiteLanguage(value: string | null | undefined): SiteLanguage | undefined {
    return SITE_LANGUAGES.find(language => language === value);
}

// Last settings default seen by this process; read synchronously by mail handlers.
export const siteLanguageSnapshot: { value: SiteLanguage | undefined } = { value: undefined };

declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        defaultLanguage?: string | null;
    }
}
