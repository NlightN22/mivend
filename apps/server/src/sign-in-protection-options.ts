import {
    HibpPasswordChecker,
    TurnstileProvider,
    type SignInProtectionOptions,
} from '@mivend/plugin-sign-in-protection';

type Env = Record<string, string | undefined>;

const SECOND_MS = 1000;

function flag(env: Env, name: string): boolean {
    const value = env[name] ?? '';
    if (value !== '' && value !== 'true' && value !== 'false') {
        throw new Error(`${name} must be true or false, got "${value}"`);
    }
    return value === 'true';
}

function positiveInt(env: Env, name: string, fallback: number): number {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer, got "${raw}"`);
    }
    return value;
}

export function signInProtectionOptionsFromEnv(env: Env): SignInProtectionOptions {
    const baseLockMs = positiveInt(env, 'SIGN_IN_THROTTLE_BASE_LOCK_SECONDS', 30) * SECOND_MS;
    const maxLockMs = positiveInt(env, 'SIGN_IN_THROTTLE_MAX_LOCK_SECONDS', 900) * SECOND_MS;
    const resetAfterMs = positiveInt(env, 'SIGN_IN_THROTTLE_RESET_AFTER_SECONDS', 3600) * SECOND_MS;
    if (resetAfterMs < maxLockMs) {
        throw new Error('SIGN_IN_THROTTLE_RESET_AFTER_SECONDS must not be below the max lock');
    }
    const siteKey = env.TURNSTILE_SITE_KEY ?? '';
    const secretKey = env.TURNSTILE_SECRET_KEY ?? '';
    if ((siteKey === '') !== (secretKey === '')) {
        throw new Error('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be set together');
    }
    return {
        throttle: {
            enabled: flag(env, 'SIGN_IN_THROTTLE_ENABLED'),
            perLogin: {
                threshold: positiveInt(env, 'SIGN_IN_THROTTLE_LOGIN_THRESHOLD', 15),
                baseLockMs,
                maxLockMs,
            },
            perLoginIp: {
                threshold: positiveInt(env, 'SIGN_IN_THROTTLE_LOGIN_IP_THRESHOLD', 5),
                baseLockMs,
                maxLockMs,
            },
            resetAfterMs,
            trustedProxyHops: positiveInt(env, 'SIGN_IN_TRUSTED_PROXY_HOPS', 2),
            cleanupPollIntervalMs: 60 * 60 * SECOND_MS,
        },
        captcha: {
            provider: siteKey ? new TurnstileProvider(siteKey, secretKey) : null,
            afterFailures: positiveInt(env, 'SIGN_IN_CAPTCHA_AFTER_FAILURES', 3),
        },
        breach: {
            checker: flag(env, 'PASSWORD_BREACH_CHECK_ENABLED')
                ? new HibpPasswordChecker(
                      (env.PASSWORD_BREACH_API_URL || 'https://api.pwnedpasswords.com').replace(
                          /\/$/,
                          '',
                      ),
                      positiveInt(env, 'PASSWORD_BREACH_TIMEOUT_MS', 3000),
                  )
                : null,
        },
    };
}
