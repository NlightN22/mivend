import type { LegalDocumentsOptions } from '@mivend/plugin-legal-documents';

type Env = Record<string, string | undefined>;

export function legalDocumentsOptionsFromEnv(env: Env): LegalDocumentsOptions {
    return {
        requisites: {
            platformName: env.LEGAL_PLATFORM_NAME,
            operatorName: env.LEGAL_OPERATOR_NAME,
            operatorStatus: env.LEGAL_OPERATOR_STATUS,
            contactEmail: env.LEGAL_CONTACT_EMAIL,
            contactAddress: env.LEGAL_CONTACT_ADDRESS,
            portalUrl: env.LEGAL_PORTAL_URL,
            jurisdiction: env.LEGAL_JURISDICTION,
        },
        fallbackLocale: env.LEGAL_FALLBACK_LOCALE || 'ru',
    };
}
