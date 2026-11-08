import type { CaptchaProvider } from './captcha/captcha-provider';
import type { BreachedPasswordChecker } from './breach/breached-password-checker';

export const loggerCtx = 'SignInProtection';
export const SIGN_IN_PROTECTION_OPTIONS = Symbol('SIGN_IN_PROTECTION_OPTIONS');
export const CAPTCHA_TOKEN_HEADER = 'x-captcha-token';

export type ThrottleScope = 'password' | 'second-step' | 'password-recheck' | 'recovery-request';

export interface ThrottleLimits {
    threshold: number;
    baseLockMs: number;
    maxLockMs: number;
}

export interface SignInProtectionOptions {
    throttle: {
        enabled: boolean;
        perLogin: ThrottleLimits;
        perLoginIp: ThrottleLimits;
        resetAfterMs: number;
        trustedProxyHops: number;
        cleanupPollIntervalMs: number;
    };
    captcha: { provider: CaptchaProvider | null; afterFailures: number };
    breach: { checker: BreachedPasswordChecker | null };
}
