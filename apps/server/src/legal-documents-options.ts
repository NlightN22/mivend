import type { LegalDocumentsOptions } from '@mivend/plugin-legal-documents';

type Env = Record<string, string | undefined>;

const DEFAULT_OPERATOR_STATUS = 'Физическое лицо';
const DEFAULT_JURISDICTION = 'Российской Федерации';

function storefrontHost(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        return new URL(url).host;
    } catch {
        return undefined;
    }
}

// The platform name and address are the storefront's own domain, so they are not configured twice.
export function legalDocumentsOptionsFromEnv(env: Env): LegalDocumentsOptions {
    return {
        requisites: {
            platformName: storefrontHost(env.STOREFRONT_PUBLIC_URL),
            operatorName: env.LEGAL_OPERATOR_NAME,
            operatorStatus: env.LEGAL_OPERATOR_STATUS || DEFAULT_OPERATOR_STATUS,
            contactEmail: env.LEGAL_CONTACT_EMAIL,
            portalUrl: env.STOREFRONT_PUBLIC_URL,
            jurisdiction: env.LEGAL_JURISDICTION || DEFAULT_JURISDICTION,
            serviceProviders: env.LEGAL_SERVICE_PROVIDERS,
        },
        fallbackLocale: env.LEGAL_FALLBACK_LOCALE || 'ru',
    };
}
