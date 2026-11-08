import {
    RangeBreachChecker,
    WidgetCaptchaProvider,
    type CaptchaProvider,
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

function captchaFromEnv(env: Env): CaptchaProvider | null {
    const kind = env.CAPTCHA_PROVIDER ?? '';
    if (kind === '') return null;
    if (kind !== 'widget')
        throw new Error(`CAPTCHA_PROVIDER must be "widget" or empty, got "${kind}"`);
    const required = [
        'CAPTCHA_SITE_KEY',
        'CAPTCHA_SECRET_KEY',
        'CAPTCHA_SCRIPT_URL',
        'CAPTCHA_VERIFY_URL',
        'CAPTCHA_WIDGET_GLOBAL',
    ];
    const missing = required.filter(name => !env[name]);
    if (missing.length > 0)
        throw new Error(`CAPTCHA_PROVIDER=widget requires ${missing.join(', ')}`);
    return new WidgetCaptchaProvider({
        siteKey: env.CAPTCHA_SITE_KEY!,
        secretKey: env.CAPTCHA_SECRET_KEY!,
        scriptUrl: env.CAPTCHA_SCRIPT_URL!,
        verifyUrl: env.CAPTCHA_VERIFY_URL!,
        widgetGlobal: env.CAPTCHA_WIDGET_GLOBAL!,
    });
}

export function signInProtectionOptionsFromEnv(env: Env): SignInProtectionOptions {
    const baseLockMs = positiveInt(env, 'SIGN_IN_THROTTLE_BASE_LOCK_SECONDS', 30) * SECOND_MS;
    const maxLockMs = positiveInt(env, 'SIGN_IN_THROTTLE_MAX_LOCK_SECONDS', 900) * SECOND_MS;
    const resetAfterMs = positiveInt(env, 'SIGN_IN_THROTTLE_RESET_AFTER_SECONDS', 3600) * SECOND_MS;
    if (resetAfterMs < maxLockMs) {
        throw new Error('SIGN_IN_THROTTLE_RESET_AFTER_SECONDS must not be below the max lock');
    }
    const captchaProvider = captchaFromEnv(env);
    const breachEnabled = flag(env, 'PASSWORD_BREACH_CHECK_ENABLED');
    const breachUrl = (env.PASSWORD_BREACH_API_URL ?? '').replace(/\/$/, '');
    if (breachEnabled && breachUrl === '') {
        throw new Error(
            'PASSWORD_BREACH_API_URL is required when PASSWORD_BREACH_CHECK_ENABLED=true',
        );
    }
    return {
        throttle: {
            enabled: flag(env, 'SIGN_IN_THROTTLE_ENABLED'),
            perLogin: {
                threshold: positiveInt(env, 'SIGN_IN_THROTTLE_LOGIN_THRESHOLD', 50),
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
            provider: captchaProvider,
            afterFailures: positiveInt(env, 'SIGN_IN_CAPTCHA_AFTER_FAILURES', 3),
        },
        breach: {
            checker: breachEnabled
                ? new RangeBreachChecker(
                      breachUrl,
                      positiveInt(env, 'PASSWORD_BREACH_TIMEOUT_MS', 3000),
                  )
                : null,
        },
    };
}
