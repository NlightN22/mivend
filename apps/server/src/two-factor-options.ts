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
    };
}
