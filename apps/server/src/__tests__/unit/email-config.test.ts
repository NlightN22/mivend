import { describe, expect, it } from 'vitest';
import { resolveEmailConfig } from '../../email-config';

const smtp = {
    EMAIL_TRANSPORT: 'smtp',
    EMAIL_SMTP_HOST: 'smtp-host',
    EMAIL_SMTP_PORT: '2587',
    EMAIL_SMTP_SECURE: 'starttls',
    EMAIL_SMTP_USER: 'sender',
    EMAIL_SMTP_PASSWORD: 'abc123',
    EMAIL_FROM_ADDRESS: 'no-reply@example.org',
    EMAIL_FROM_NAME: 'mivend',
};
const out = '/tmp/mailbox';

describe('resolveEmailConfig', () => {
    it('defaults to the file transport outside production', () => {
        expect(resolveEmailConfig({}, out).transport).toEqual({ type: 'file', outputPath: out });
    });

    it('keeps the dev mailbox flag independent of NODE_ENV', () => {
        const config = resolveEmailConfig(
            { NODE_ENV: 'production', EMAIL_TRANSPORT: 'file', EMAIL_DEV_MAILBOX_ENABLED: 'true' },
            out,
        );
        expect(config.devMode).toBe(true);
    });

    it('fails in production when EMAIL_TRANSPORT is unset', () => {
        expect(() => resolveEmailConfig({ NODE_ENV: 'production' }, out)).toThrow(
            /EMAIL_TRANSPORT is required/,
        );
    });

    it('allows an explicit file transport in production', () => {
        expect(
            resolveEmailConfig({ NODE_ENV: 'production', EMAIL_TRANSPORT: 'file' }, out).transport,
        ).toMatchObject({ type: 'file' });
    });

    it('rejects an unknown transport', () => {
        expect(() => resolveEmailConfig({ EMAIL_TRANSPORT: 'ses' }, out)).toThrow(/file or smtp/);
    });

    it.each([
        'EMAIL_SMTP_HOST',
        'EMAIL_SMTP_PORT',
        'EMAIL_SMTP_SECURE',
        'EMAIL_SMTP_USER',
        'EMAIL_SMTP_PASSWORD',
        'EMAIL_FROM_ADDRESS',
    ])('fails when %s is missing for smtp', name => {
        expect(() => resolveEmailConfig({ ...smtp, [name]: undefined }, out)).toThrow(name);
    });

    it('maps starttls and tls to the nodemailer flags and takes the sender from env', () => {
        const starttls = resolveEmailConfig(smtp, out);
        expect(starttls.transport).toMatchObject({
            type: 'smtp',
            host: 'smtp-host',
            port: 2587,
            secure: false,
            requireTLS: true,
            auth: { user: 'sender', pass: 'abc123' },
        });
        expect(starttls.fromAddress).toBe('"mivend" <no-reply@example.org>');
        expect(
            resolveEmailConfig({ ...smtp, EMAIL_SMTP_SECURE: 'tls', EMAIL_SMTP_PORT: '2465' }, out)
                .transport,
        ).toMatchObject({ secure: true, requireTLS: false, port: 2465 });
    });

    it('rejects a bad secure mode and a placeholder password in production', () => {
        expect(() => resolveEmailConfig({ ...smtp, EMAIL_SMTP_SECURE: 'plain' }, out)).toThrow(
            /starttls or tls/,
        );
        expect(() =>
            resolveEmailConfig(
                {
                    ...smtp,
                    NODE_ENV: 'production',
                    EMAIL_SMTP_PASSWORD: 'change-me',
                    MANAGER_PUBLIC_URL: 'https://m.example.org',
                    STOREFRONT_PUBLIC_URL: 'https://s.example.org',
                },
                out,
            ),
        ).toThrow(/placeholder/);
    });

    it('rejects an out-of-range port and a sender name that would break the header', () => {
        expect(() => resolveEmailConfig({ ...smtp, EMAIL_SMTP_PORT: '70000' }, out)).toThrow(
            /1 to 65535/,
        );
        expect(() => resolveEmailConfig({ ...smtp, EMAIL_FROM_NAME: 'a"b' }, out)).toThrow(
            /EMAIL_FROM_NAME/,
        );
        expect(() => resolveEmailConfig({ ...smtp, EMAIL_FROM_NAME: 'a\nb' }, out)).toThrow(
            /EMAIL_FROM_NAME/,
        );
    });

    it('requires both public URLs in production with smtp', () => {
        const prod = {
            ...smtp,
            NODE_ENV: 'production',
            MANAGER_PUBLIC_URL: 'https://m.example.org',
            STOREFRONT_PUBLIC_URL: 'https://s.example.org',
        };
        expect(resolveEmailConfig(prod, out).transport).toMatchObject({ type: 'smtp' });
        expect(() =>
            resolveEmailConfig({ ...prod, STOREFRONT_PUBLIC_URL: undefined }, out),
        ).toThrow(/STOREFRONT_PUBLIC_URL/);
        expect(() => resolveEmailConfig({ ...prod, MANAGER_PUBLIC_URL: undefined }, out)).toThrow(
            /MANAGER_PUBLIC_URL/,
        );
    });
});
