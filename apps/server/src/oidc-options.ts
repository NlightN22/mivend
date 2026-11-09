import type { OidcPluginOptions } from '@mivend/plugin-oidc-sign-in';

type Env = Record<string, string | undefined>;

const KEYS = [
    ['OIDC_ISSUER_URL', 'issuer'],
    ['OIDC_CLIENT_ID', 'clientId'],
    ['OIDC_CLIENT_SECRET', 'clientSecret'],
    ['OIDC_REDIRECT_URI', 'redirectUri'],
] as const;

// All four unset disables the feature; a partial set fails boot rather than half-enabling sign-in.
export function oidcOptionsFromEnv(env: Env): OidcPluginOptions | null {
    const values = KEYS.map(([name]) => (env[name] ?? '').trim());
    if (values.every(value => value === '')) return null;
    const missing = KEYS.filter((_, index) => values[index] === '').map(([name]) => name);
    if (missing.length > 0) throw new Error(`OIDC sign-in needs ${missing.join(', ')}`);
    const [issuer, clientId, clientSecret, redirectUri] = values;
    return { issuer, clientId, clientSecret, redirectUri };
}
