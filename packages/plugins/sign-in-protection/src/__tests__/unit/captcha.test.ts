import { Logger } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CaptchaProvider, CaptchaVerdict } from '../../captcha/captcha-provider';
import { CaptchaService } from '../../captcha/captcha.service';
import { WidgetCaptchaProvider } from '../../captcha/widget-captcha-provider';
import type { SignInThrottleService } from '../../sign-in-throttle.service';
import type { SignInProtectionOptions } from '../../types';

const limits = { threshold: 5, baseLockMs: 1, maxLockMs: 1 };

function service(failures: number, verdict: CaptchaVerdict | null) {
    const verify = vi.fn(async () => verdict ?? 'valid');
    const provider: CaptchaProvider | null =
        verdict === null
            ? null
            : {
                  name: 'test',
                  siteKey: 'site',
                  scriptUrl: 'https://captcha.test/api.js',
                  widgetGlobal: 'g',
                  verify,
              };
    const options: SignInProtectionOptions = {
        throttle: {
            enabled: true,
            perLogin: limits,
            perLoginIp: limits,
            resetAfterMs: 1,
            trustedProxyHops: 1,
            cleanupPollIntervalMs: 1,
        },
        captcha: { provider, afterFailures: 3 },
        breach: { checker: null },
    };
    const throttle = { failureCount: async () => failures } as unknown as SignInThrottleService;
    return { verify, captcha: new CaptchaService(throttle, options) };
}

const withToken = (token?: string) =>
    ({
        req: { headers: token ? { 'x-captcha-token': token } : {}, ip: '1.2.3.4' },
    }) as unknown as RequestContext;

afterEach(() => vi.restoreAllMocks());

describe('CaptchaService', () => {
    it('is not required below the failure count or without a provider', async () => {
        expect((await service(2, 'valid').captcha.requirement(withToken(), 'a')).required).toBe(
            false,
        );
        expect((await service(9, null).captcha.requirement(withToken(), 'a')).required).toBe(false);
    });

    it('is required, with the site key, after N failures', async () => {
        expect(await service(3, 'valid').captcha.requirement(withToken(), 'a')).toEqual({
            required: true,
            siteKey: 'site',
            scriptUrl: 'https://captcha.test/api.js',
            widgetGlobal: 'g',
        });
    });

    it('lets a sign-in through when no challenge is due, without verifying', async () => {
        const { captcha, verify } = service(0, 'invalid');
        expect(await captcha.passes(withToken(), 'a')).toBe(true);
        expect(verify).not.toHaveBeenCalled();
    });

    it('refuses a missing or rejected token once a challenge is due', async () => {
        expect(await service(3, 'valid').captcha.passes(withToken(), 'a')).toBe(false);
        expect(await service(3, 'invalid').captcha.passes(withToken('t'), 'a')).toBe(false);
        expect(await service(3, 'valid').captcha.passes(withToken('t'), 'a')).toBe(true);
    });

    it('never blocks when the provider is unavailable, and logs a warning', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
        expect(await service(3, 'unavailable').captcha.passes(withToken('t'), 'a')).toBe(true);
        expect(warn).toHaveBeenCalledOnce();
    });
});

describe('WidgetCaptchaProvider', () => {
    const make = (respond: () => Promise<Response>) =>
        new WidgetCaptchaProvider(
            {
                siteKey: 'site',
                secretKey: 'secret',
                scriptUrl: 'https://captcha.test/api.js',
                verifyUrl: 'https://verify.test',
                widgetGlobal: 'g',
            },
            vi.fn(respond),
        );

    it('maps success, rejection and outages', async () => {
        expect(await make(async () => Response.json({ success: true })).verify('t', 'ip')).toBe(
            'valid',
        );
        expect(await make(async () => Response.json({ success: false })).verify('t', 'ip')).toBe(
            'invalid',
        );
        expect(await make(async () => new Response('', { status: 500 })).verify('t', 'ip')).toBe(
            'unavailable',
        );
        expect(await make(() => Promise.reject(new Error('down'))).verify('t', 'ip')).toBe(
            'unavailable',
        );
    });
});
