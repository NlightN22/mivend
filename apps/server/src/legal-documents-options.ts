import { geoProviderHosts } from '@mivend/plugin-counterparty';
import type { LegalDocumentsOptions } from '@mivend/plugin-legal-documents';

type Env = Record<string, string | undefined>;

const DEFAULT_OPERATOR_STATUS = 'Физическое лицо';
const DEFAULT_JURISDICTION = 'Российской Федерации';

function hostOf(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        return new URL(url).host;
    } catch {
        return undefined;
    }
}

// Third-party services are the hosts the captcha and map settings already point at, so they are not configured twice.
function serviceProviders(env: Env): string | undefined {
    const captcha = env.CAPTCHA_PROVIDER ? hostOf(env.CAPTCHA_SCRIPT_URL) : undefined;
    const geoKeys = (env.GEO_PROVIDERS ?? '')
        .split(',')
        .map(key => key.trim())
        .filter(Boolean);
    const hosts = [...(captcha ? [captcha] : []), ...geoProviderHosts(geoKeys)];
    return hosts.length > 0 ? [...new Set(hosts)].join(', ') : undefined;
}

// The platform name and address are the storefront's own domain, so they are not configured twice.
export function legalDocumentsOptionsFromEnv(env: Env): LegalDocumentsOptions {
    return {
        requisites: {
            platformName: hostOf(env.STOREFRONT_PUBLIC_URL),
            operatorName: env.LEGAL_OPERATOR_NAME,
            operatorStatus: env.LEGAL_OPERATOR_STATUS || DEFAULT_OPERATOR_STATUS,
            contactEmail: env.LEGAL_CONTACT_EMAIL,
            portalUrl: env.STOREFRONT_PUBLIC_URL,
            jurisdiction: env.LEGAL_JURISDICTION || DEFAULT_JURISDICTION,
            serviceProviders: serviceProviders(env),
        },
        fallbackLocale: env.LEGAL_FALLBACK_LOCALE || 'ru',
    };
}
