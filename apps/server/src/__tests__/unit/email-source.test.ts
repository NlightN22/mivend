import path from 'path';
import { describe, expect, it } from 'vitest';
import { Injector, RequestContext } from '@vendure/core';
import { HandlebarsMjmlGenerator, InitializedEmailPluginOptions } from '@vendure/email-plugin';
import { createEmailHandlers } from '../../email-handlers';
import { LanguageTemplateLoader } from '../../email-language';
import { emailSourceConfigFromEnv, resolveEmailSource } from '../../email-source';
import { resolveEmailConfig } from '../../email-config';

const ENV = {
    SITE_NAME: 'Site A',
    MANAGER_PUBLIC_URL: 'https://sales.example.com',
    STOREFRONT_PUBLIC_URL: 'https://shop.example.com',
    DASHBOARD_PUBLIC_URL: 'https://admin.example.com',
};
const CONFIG = emailSourceConfigFromEnv(ENV, 'no-reply@example.com');
const URLS = {
    staff: 'https://sales.example.com/set-password',
    customer: 'https://shop.example.com/set-password',
};
const HEADER = 'x-mivend-portal';

function ctx(
    opts: { api?: 'admin' | 'shop'; headers?: Record<string, string> } = {},
): RequestContext {
    return {
        channel: { code: 'default' },
        languageCode: 'en',
        apiType: opts.api ?? 'shop',
        req: { query: {}, headers: opts.headers ?? {} },
        serialize: () => ({}),
    } as unknown as RequestContext;
}

describe('resolveEmailSource', () => {
    it('uses the storefront domain for customers', () => {
        expect(resolveEmailSource(CONFIG, ctx(), false)).toEqual({
            domain: 'shop.example.com',
            from: '"Site A (shop.example.com)" <no-reply@example.com>',
            subjectPrefix: '[shop.example.com] ',
        });
    });

    it('uses the manager portal domain for staff', () => {
        const source = resolveEmailSource(CONFIG, ctx({ api: 'admin' }), true);
        expect(source.domain).toBe('sales.example.com');
        expect(source.subjectPrefix).toBe('[sales.example.com] ');
    });

    it('uses the dashboard domain only for staff on admin-api with the proxy header', () => {
        const dash = { api: 'admin' as const, headers: { [HEADER]: 'dashboard' } };
        expect(resolveEmailSource(CONFIG, ctx(dash), true).domain).toBe('admin.example.com');
        expect(resolveEmailSource(CONFIG, ctx({ ...dash, api: 'shop' }), true).domain).toBe(
            'sales.example.com',
        );
        expect(resolveEmailSource(CONFIG, ctx(dash), false).domain).toBe('shop.example.com');
    });

    it('has no prefix and a plain sender when the domain is not configured', () => {
        const bare = emailSourceConfigFromEnv({ SITE_NAME: 'Site A' }, 'no-reply@example.com');
        expect(resolveEmailSource(bare, ctx(), false)).toEqual({
            domain: '',
            from: '"Site A" <no-reply@example.com>',
            subjectPrefix: '',
        });
    });

    it('keeps the port, so contours on one host stay distinguishable', () => {
        const dev = emailSourceConfigFromEnv(
            { STOREFRONT_PUBLIC_URL: 'https://dev.example.com:8004' },
            'a@b.c',
        );
        expect(resolveEmailSource(dev, ctx(), false).domain).toBe('dev.example.com:8004');
    });
});

describe('boot validation', () => {
    const prod = {
        NODE_ENV: 'production',
        EMAIL_TRANSPORT: 'smtp',
        EMAIL_SMTP_HOST: 'smtp-host',
        EMAIL_SMTP_PORT: '2587',
        EMAIL_SMTP_SECURE: 'starttls',
        EMAIL_SMTP_USER: 'sender',
        EMAIL_SMTP_PASSWORD: 'abc123',
        EMAIL_FROM_ADDRESS: 'no-reply@example.com',
        ...ENV,
    };

    it('accepts the full production set', () => {
        expect(resolveEmailConfig(prod, '/tmp/m').fromEmail).toBe('no-reply@example.com');
    });

    it('fails when DASHBOARD_PUBLIC_URL is missing in production with smtp', () => {
        expect(() =>
            resolveEmailConfig({ ...prod, DASHBOARD_PUBLIC_URL: undefined }, '/tmp/m'),
        ).toThrow(/DASHBOARD_PUBLIC_URL is required/);
    });

    it.each(['not a url', 'ftp://admin.example.com'])('fails on invalid URL %s', value => {
        expect(() =>
            resolveEmailConfig({ ...prod, DASHBOARD_PUBLIC_URL: value }, '/tmp/m'),
        ).toThrow(/DASHBOARD_PUBLIC_URL must be an http\(s\) URL/);
        expect(() => emailSourceConfigFromEnv({ MANAGER_PUBLIC_URL: value }, 'a@b.c')).toThrow(
            /MANAGER_PUBLIC_URL/,
        );
    });
});

const loader = new LanguageTemplateLoader(path.join(__dirname, '../../../static/email/templates'));

interface Details {
    from: string;
    subject: string;
    templateFile: string;
    templateVars: Record<string, unknown>;
}

async function run(type: string, request: RequestContext, staff: boolean): Promise<Details> {
    const method = {
        identifier: 'u@example.org',
        pendingIdentifier: 'n@example.org',
        passwordResetToken: 't',
        verificationToken: 't',
        identifierChangeToken: 't',
    };
    const user = {
        id: 1,
        identifier: 'u@example.org',
        authenticationMethods: [],
        getNativeAuthenticationMethod: () => method,
    };
    const injector = {
        get: () => ({ getRepository: () => ({ exists: async () => staff }) }),
    } as unknown as Injector;
    const handler = createEmailHandlers(URLS, URLS, 'en', CONFIG).find(
        h => h.type === type,
    ) as unknown as {
        handle: (e: unknown, g: unknown, i: Injector) => Promise<Details | undefined>;
    };
    const details = await handler.handle(
        { ctx: request, user, token: 't', deviceLabel: 'd', signedInAt: new Date() },
        { siteName: 'Site A' },
        injector,
    );
    if (!details) throw new Error('no mail');
    return details;
}

const TYPES = [
    'password-reset',
    'email-verification',
    'email-address-change',
    'two-factor-enabled',
    'two-factor-changed',
    'two-factor-recovery',
    'two-factor-recovery-completed',
    'new-device-sign-in',
];

describe.each(TYPES)('%s source', type => {
    it('takes sender, subject prefix and template var from the resolver', async () => {
        const customer = await run(type, ctx(), false);
        expect(customer.from).toBe('{{ sourceFrom }}');
        expect(customer.subject.startsWith('[shop.example.com] ')).toBe(true);
        expect(customer.templateVars.sourceDomain).toBe('shop.example.com');
        expect(customer.templateVars.sourceFrom).toBe(
            '"Site A (shop.example.com)" <no-reply@example.com>',
        );
        const staff = await run(type, ctx({ api: 'admin' }), true);
        expect(staff.subject.startsWith('[sales.example.com] ')).toBe(true);
        const dash = await run(
            type,
            ctx({ api: 'admin', headers: { [HEADER]: 'dashboard' } }),
            true,
        );
        expect(dash.templateVars.sourceDomain).toBe('admin.example.com');
    });

    it('ignores a forged Host or Origin for sender, subject and domain', async () => {
        const forged = ctx({
            headers: {
                host: 'evil.example.net',
                origin: 'https://evil.example.net',
                'x-forwarded-host': 'evil.example.net',
            },
        });
        const plain = await run(type, ctx(), false);
        const mail = await run(type, forged, false);
        expect(mail.subject).toBe(plain.subject);
        expect(mail.templateVars).toEqual(plain.templateVars);
        expect(JSON.stringify(mail)).not.toContain('evil');
    });
});

describe('rendered footer and links under a forged Host', () => {
    it('shows the configured domain and keeps the configured link base', async () => {
        const forged = ctx({
            headers: { host: 'evil.example.net', origin: 'https://evil.example.net' },
        });
        const details = await run('password-reset', forged, false);
        const generator = new HandlebarsMjmlGenerator();
        await generator.onInit({
            templateLoader: loader,
        } as unknown as InitializedEmailPluginOptions);
        const body = await loader.loadTemplate({} as Injector, forged, {
            type: 'password-reset',
            templateName: details.templateFile,
            templateVars: details.templateVars,
        });
        const mail = await generator.generate(
            details.from,
            details.subject,
            body,
            details.templateVars,
        );
        expect(mail.from).toBe('"Site A (shop.example.com)" <no-reply@example.com>');
        expect(mail.body).toContain('Sent by shop.example.com');
        expect(mail.body).toContain('https://shop.example.com/set-password?token=t');
        expect(mail.body).not.toContain('evil');
    });
});
