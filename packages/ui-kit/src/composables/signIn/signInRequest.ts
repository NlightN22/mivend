import { ref } from 'vue';

export const CAPTCHA_TOKEN_HEADER = 'X-Captcha-Token';

const SIGN_IN_OPERATION =
    /\b(login|authenticate|startTwoFactorSignIn|requestTwoFactorRecovery|completeTwoFactorRecovery|requestPasswordReset|resetPassword|signInCaptchaRequirement)\s*[({]/;

// The proxy rate-limits only requests carrying ?auth=1; the server does not trust the mark.
export function isSignInRequest(query: string): boolean {
    return SIGN_IN_OPERATION.test(query);
}

export function signInUrl(url: string, query: string): string {
    return isSignInRequest(query) ? `${url}?auth=1` : url;
}

export const captchaToken = ref('');

export function signInHeaders(query: string): Record<string, string> {
    return isSignInRequest(query) && captchaToken.value
        ? { [CAPTCHA_TOKEN_HEADER]: captchaToken.value }
        : {};
}
