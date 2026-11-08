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

// A token is single use: it is taken for exactly one request, whatever the outcome.
export function signInHeaders(query: string): Record<string, string> {
    if (!isSignInRequest(query) || !captchaToken.value) return {};
    const headers = { [CAPTCHA_TOKEN_HEADER]: captchaToken.value };
    captchaToken.value = '';
    return headers;
}
