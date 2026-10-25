import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { Injector, RequestContext } from '@vendure/core';
import { HandlebarsMjmlGenerator, InitializedEmailPluginOptions } from '@vendure/email-plugin';
import {} from '../../account-email-handlers';
import { EMAIL_SUBJECTS } from '../../account-email-handlers';
import { createEmailHandlers } from '../../email-handlers';
import { emailGlobalTemplateVars } from '../../email-config';
import {
    EMAIL_LANGUAGES,
    EmailLanguage,
    LanguageTemplateLoader,
    defaultEmailLanguage,
    resolveEmailLanguage,
} from '../../email-language';
import { emailFooterText } from '../../site-config';

const loader = new LanguageTemplateLoader(path.join(__dirname, '../../../static/email/templates'));
const injector = {
    get: () => ({ getRepository: () => ({ exists: async () => false }) }),
} as unknown as Injector;
const method = {
    identifier: 'user@example.org',
    pendingIdentifier: 'new@example.org',
    passwordResetToken: 'tok1',
    verificationToken: 'tok1',
    identifierChangeToken: 'tok1',
};

function ctxWith(languageCode?: string): RequestContext {
    return {
        channel: { code: 'default' },
        languageCode: 'en',
        req: languageCode === undefined ? undefined : { query: { languageCode } },
        serialize: () => ({}),
    } as unknown as RequestContext;
}

interface Mail {
    subject: string;
    body: string;
}

const URLS = {
    staff: 'https://m.example.org/set-password',
    customer: 'https://shop.example.org/set-password',
};
const REGISTERED = createEmailHandlers(URLS, 'en').map(h => h.type);
type MailType = 'password-reset' | 'email-verification' | 'email-address-change';
const MAIL_TYPES: MailType[] = ['password-reset', 'email-verification', 'email-address-change'];

async function render(
    type: MailType,
    ctx: RequestContext,
    fallback: EmailLanguage,
    env = {},
): Promise<Mail> {
    const user = {
        id: 1,
        identifier: method.identifier,
        authenticationMethods: [],
        getNativeAuthenticationMethod: () => method,
    };
    const handler = createEmailHandlers(URLS, fallback).find(h => h.type === type) as unknown as {
        handle: (
            e: unknown,
            g: unknown,
            i: Injector,
        ) => Promise<
            | (Record<string, unknown> & {
                  templateVars: Record<string, unknown>;
                  subject: string;
                  templateFile: string;
                  from: string;
              })
            | undefined
        >;
    };
    const globals = {
        ...emailGlobalTemplateVars('no-reply@example.org', 'https://shop.example.org', {
            SITE_NAME: 'Site A',
            ...env,
        }),
    };
    const details = await handler.handle({ ctx, user }, globals, injector);
    if (!details) throw new Error('no mail');
    const generator = new HandlebarsMjmlGenerator();
    await generator.onInit({ templateLoader: loader } as unknown as InitializedEmailPluginOptions);
    const body = await loader.loadTemplate(injector, ctx, {
        type: type,
        templateName: details.templateFile,
        templateVars: details.templateVars,
    });
    const mail = await generator.generate(
        details.from,
        details.subject,
        body,
        details.templateVars,
    );
    return { subject: mail.subject, body: mail.body };
}

const LINKS: Record<MailType, string> = {
    'password-reset': 'https://shop.example.org/set-password?token=tok1',
    'email-verification': 'https://shop.example.org/verify?token=tok1',
    'email-address-change': 'href="?token=tok1"',
};
const SUBJECTS: Record<MailType, Record<EmailLanguage, string>> = {
    'password-reset': { en: 'Forgotten password reset', ru: 'Восстановление пароля' },
    'email-verification': {
        en: 'Please verify your email address',
        ru: 'Подтвердите адрес электронной почты',
    },
    'email-address-change': {
        en: 'Please verify your change of email address',
        ru: 'Подтвердите новый адрес электронной почты',
    },
};
const DEFAULT_FOOTER: Record<EmailLanguage, string> = {
    en: 'This is an automated message, please do not reply.',
    ru: 'Это автоматическое сообщение, отвечать на него не нужно.',
};

describe.each(MAIL_TYPES)('%s mail', type => {
    it.each(EMAIL_LANGUAGES)('renders subject, header, footer and link in %s', async language => {
        const mail = await render(type, ctxWith(language), 'en');
        expect(mail.subject).toBe(SUBJECTS[type][language]);
        expect(mail.body).toContain('Site A');
        expect(mail.body).toContain(DEFAULT_FOOTER[language]);
        expect(mail.body).toContain(LINKS[type]);
        expect(mail.body).not.toMatch(/\[company header\]|\[footer text\]/);
    });

    it('uses the configured footer text instead of the default', async () => {
        const mail = await render(type, ctxWith('ru'), 'en', {
            EMAIL_FOOTER_TEXT: 'Custom footer line',
        });
        expect(mail.body).toContain('Custom footer line');
        expect(mail.body).not.toContain(DEFAULT_FOOTER.ru);
    });

    it('falls back to the deployment default when the request names no language', async () => {
        expect((await render(type, ctxWith(), 'ru')).subject).toBe(SUBJECTS[type].ru);
        expect((await render(type, ctxWith(), 'en')).subject).toBe(SUBJECTS[type].en);
    });

    it('falls back to the deployment default for an unsupported language', async () => {
        expect((await render(type, ctxWith('de'), 'ru')).subject).toBe(SUBJECTS[type].ru);
    });
});

describe('language selection', () => {
    it('prefers the request language and accepts regional tags', () => {
        expect(resolveEmailLanguage(ctxWith('ru'), 'en')).toBe('ru');
        expect(resolveEmailLanguage(ctxWith('RU-ru'), 'en')).toBe('ru');
    });

    it('ignores the query language on admin-api requests', () => {
        const ctx = {
            apiType: 'admin',
            req: { query: { languageCode: 'en' } },
        } as unknown as RequestContext;
        expect(resolveEmailLanguage(ctx, 'ru')).toBe('ru');
    });

    it('ignores a non-string query value', () => {
        const ctx = { req: { query: { languageCode: ['ru'] } } } as unknown as RequestContext;
        expect(resolveEmailLanguage(ctx, 'en')).toBe('en');
    });

    it('loads English when the template vars carry no usable language', async () => {
        const body = await loader.loadTemplate(injector, ctxWith(), {
            type: 'password-reset',
            templateName: 'body.hbs',
            templateVars: {},
        });
        expect(body).toContain('Someone requested a new password');
    });
});

describe('boot-time validation', () => {
    it('defaults SITE_DEFAULT_LANGUAGE to en and accepts supported codes', () => {
        expect(defaultEmailLanguage({})).toBe('en');
        expect(defaultEmailLanguage({ SITE_DEFAULT_LANGUAGE: 'ru' })).toBe('ru');
    });

    it('rejects an unsupported SITE_DEFAULT_LANGUAGE', () => {
        expect(() => defaultEmailLanguage({ SITE_DEFAULT_LANGUAGE: 'de' })).toThrow(
            /SITE_DEFAULT_LANGUAGE/,
        );
    });

    it('accepts an apostrophe and an ampersand', () => {
        expect(emailFooterText({ EMAIL_FOOTER_TEXT: "Tom & Jerry's shop" })).toBe(
            "Tom & Jerry's shop",
        );
    });

    it.each(['a<b', 'a"b', 'a\nb', '{{x}}', 'a$b', 'a;b'])(
        'rejects EMAIL_FOOTER_TEXT %j',
        value => {
            expect(() => emailFooterText({ EMAIL_FOOTER_TEXT: value })).toThrow(
                /EMAIL_FOOTER_TEXT/,
            );
        },
    );

    it('accepts a plain footer text and treats unset as empty', () => {
        expect(emailFooterText({ EMAIL_FOOTER_TEXT: 'Site A, example.org' })).toBe(
            'Site A, example.org',
        );
        expect(emailFooterText({})).toBe('');
    });
});

describe('background-raised mails', () => {
    it.each(['email-verification', 'password-reset'] as const)(
        '%s without a request uses SITE_DEFAULT_LANGUAGE',
        async type => {
            const background = {
                channel: { code: 'default' },
                languageCode: 'en',
                serialize: () => ({}),
            };
            const mail = await render(type, background as unknown as RequestContext, 'ru');
            expect(mail.subject).toBe(SUBJECTS[type].ru);
        },
    );
});

describe('mail tables', () => {
    it('cover exactly the registered handlers', () => {
        expect([...REGISTERED].sort()).toEqual([...MAIL_TYPES].sort());
        for (const type of REGISTERED) {
            expect(LINKS[type as MailType], type).toBeDefined();
            expect(SUBJECTS[type as MailType], type).toBeDefined();
        }
    });

    it('renders emailLanguage and an EMAIL_SUBJECTS subject for every handler', async () => {
        const subjects = Object.values(EMAIL_SUBJECTS).flatMap(m => Object.values(m));
        for (const type of REGISTERED) {
            const mail = await render(type as MailType, ctxWith('ru'), 'en');
            expect(subjects, type).toContain(mail.subject);
            expect(mail.subject, type).not.toBe(SUBJECTS[type as MailType].en);
        }
    });

    it('leaves the address-change link base undefined until a confirmation page exists', () => {
        expect(
            emailGlobalTemplateVars('a@example.org', 'https://shop.example.org', {}),
        ).not.toHaveProperty('changeEmailAddressUrl');
    });
});

describe('registered mail types', () => {
    const registered = createEmailHandlers({ staff: '', customer: '' }, 'en').map(h => h.type);
    const templatesDir = path.join(__dirname, '../../../static/email/templates');

    it('registers every template directory and the other way round', () => {
        const dirs = readdirSync(templatesDir).filter(d => d !== 'partials');
        expect([...registered].sort()).toEqual(dirs.sort());
    });

    it.each(EMAIL_LANGUAGES)('ships a %s body for every registered mail', language => {
        for (const type of registered) {
            expect(existsSync(path.join(templatesDir, type, `body.${language}.hbs`))).toBe(true);
        }
    });
});
