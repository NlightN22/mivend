import { describe, expect, it } from 'vitest';

import { signInProtectionOptionsFromEnv } from '../../sign-in-protection-options';

const CAPTCHA = {
    CAPTCHA_PROVIDER: 'widget',
    CAPTCHA_SITE_KEY: 'site',
    CAPTCHA_SECRET_KEY: 'secret',
    CAPTCHA_SCRIPT_URL: 'https://captcha.example.com/widget.js',
    CAPTCHA_VERIFY_URL: 'https://captcha.example.com/verify',
    CAPTCHA_WIDGET_GLOBAL: 'captchaWidget',
};

describe('signInProtectionOptionsFromEnv', () => {
    it('is off by default', () => {
        const options = signInProtectionOptionsFromEnv({});
        expect(options.throttle.enabled).toBe(false);
        expect(options.captcha.provider).toBeNull();
        expect(options.breach.checker).toBeNull();
    });

    it('builds the CAPTCHA provider from configuration', () => {
        expect(signInProtectionOptionsFromEnv(CAPTCHA).captcha.provider).toMatchObject({
            siteKey: 'site',
            scriptUrl: 'https://captcha.example.com/widget.js',
            widgetGlobal: 'captchaWidget',
        });
    });

    it.each([
        ['a plain http script URL', { CAPTCHA_SCRIPT_URL: 'http://captcha.example.com/widget.js' }],
        ['a global that is not an identifier', { CAPTCHA_WIDGET_GLOBAL: 'a.b; alert(1)' }],
        ['a missing secret', { CAPTCHA_SECRET_KEY: '' }],
        ['an unknown provider', { CAPTCHA_PROVIDER: 'other' }],
    ])('fails boot on %s', (_name, override) => {
        expect(() => signInProtectionOptionsFromEnv({ ...CAPTCHA, ...override })).toThrow();
    });

    it('requires the breach service URL when the check is on', () => {
        expect(() =>
            signInProtectionOptionsFromEnv({ PASSWORD_BREACH_CHECK_ENABLED: 'true' }),
        ).toThrow();
        expect(
            signInProtectionOptionsFromEnv({
                PASSWORD_BREACH_CHECK_ENABLED: 'true',
                PASSWORD_BREACH_API_URL: 'https://breach-range.example.com/',
            }).breach.checker,
        ).not.toBeNull();
    });
});
