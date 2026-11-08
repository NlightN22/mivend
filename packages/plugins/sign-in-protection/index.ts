export { SignInProtectionPlugin } from './src/sign-in-protection.plugin';
export { SignInGuardService } from './src/sign-in-guard.service';
export { SignInThrottleService } from './src/sign-in-throttle.service';
export { ThrottleStoreService } from './src/throttle-store.service';
export { lockDurationMs, remainingLockMs, liveFailures } from './src/throttle-policy';
export { WidgetCaptchaProvider } from './src/captcha/widget-captcha-provider';
export type { WidgetCaptchaConfig } from './src/captcha/widget-captcha-provider';
export type { CaptchaProvider, CaptchaVerdict } from './src/captcha/captcha-provider';
export { RangeBreachChecker } from './src/breach/range-breach-checker';
export type {
    BreachedPasswordChecker,
    BreachVerdict,
} from './src/breach/breached-password-checker';
export { PASSWORD_BREACHED_MESSAGE } from './src/breach/breach-checked-password-validation';
export { CAPTCHA_TOKEN_HEADER } from './src/types';
export type { SignInProtectionOptions, ThrottleLimits, ThrottleScope } from './src/types';
