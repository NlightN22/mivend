import { afterEach, describe, expect, it } from 'vitest';

import {
    captchaToken,
    isSignInRequest,
    signInHeaders,
    signInUrl,
} from '../../composables/signIn/signInRequest';
import { useSignInCaptcha } from '../../composables/signIn/useSignInCaptcha';

afterEach(() => {
    captchaToken.value = '';
});

describe('sign-in request marking', () => {
    it('marks sign-in, second-step and reset operations only', () => {
        for (const op of [
            'mutation Login($u: String!) { login(username: $u) { __typename } }',
            'mutation { authenticate(input: { twoFactor: {} }) { __typename } }',
            'mutation { startTwoFactorSignIn(username: "a") { __typename } }',
            'mutation { requestPasswordReset(emailAddress: "a") { __typename } }',
            'query { signInCaptchaRequirement(login: "a") { required } }',
        ]) {
            expect(signInUrl('/shop-api', op)).toBe('/shop-api?auth=1');
        }
        expect(isSignInRequest('query { activeCustomer { id } }')).toBe(false);
        expect(signInUrl('/admin-api', 'query { products { items { id } } }')).toBe('/admin-api');
    });

    it('attaches the CAPTCHA token to sign-in requests only', () => {
        captchaToken.value = 'tok';
        expect(signInHeaders('mutation { login(username: "a") { __typename } }')).toEqual({
            'X-Captcha-Token': 'tok',
        });
        expect(signInHeaders('query { activeCustomer { id } }')).toEqual({});
    });
});

describe('useSignInCaptcha', () => {
    it('shows the widget when required and drops the spent token on refresh', async () => {
        const captcha = useSignInCaptcha(async () => ({ required: true, siteKey: 'site' }));
        captcha.onToken('spent');
        await captcha.refresh('a');
        expect(captcha.required.value).toBe(true);
        expect(captcha.siteKey.value).toBe('site');
        expect(captchaToken.value).toBe('');
        expect(captcha.widgetKey.value).toBe(1);
    });

    it('never blocks the form when the requirement cannot be read', async () => {
        const captcha = useSignInCaptcha(() => Promise.reject(new Error('down')));
        await captcha.refresh('a');
        expect(captcha.required.value).toBe(false);
    });
});
