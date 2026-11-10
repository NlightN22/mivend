import { TwoFactorPluginOptions, resolveEncryptionKey } from '@mivend/plugin-two-factor';
import { siteName } from './site-config';

type Env = Record<string, string | undefined>;

export function twoFactorOptionsFromEnv(env: Env, cookieSecret: string): TwoFactorPluginOptions {
    const flag = env.TWO_FACTOR_REQUIRED ?? '';
    if (flag !== '' && flag !== 'true' && flag !== 'false') {
        throw new Error(`TWO_FACTOR_REQUIRED must be true or false, got "${flag}"`);
    }
    return {
        required: flag === 'true',
        encryptionKey: resolveEncryptionKey(env, cookieSecret),
        issuer: siteName(env),
        issuerByApi: {
            shop: hostOf(env.STOREFRONT_PUBLIC_URL),
            admin: hostOf(env.MANAGER_PUBLIC_URL),
        },
    };
}

// The authenticator entry is named by the portal's domain, so the shop and manager entries cannot be mixed up.
function hostOf(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        return new URL(url).hostname || undefined;
    } catch {
        return undefined;
    }
}
