import { createRequire } from 'module';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Injector, RequestContext } from '@vendure/core';
import {
    FileBasedTemplateLoader,
    HandlebarsMjmlGenerator,
    InitializedEmailPluginOptions,
    NodemailerEmailSender,
    SMTPTransportOptions,
} from '@vendure/email-plugin';
import { resolveEmailConfig } from '../../email-config';

const sendMail = vi.fn().mockResolvedValue({});
const createTransport = vi.fn((options: unknown) => ({ sendMail, options }));
// The plugin loads its own nodemailer copy; a plain import would mock a different instance.
const pluginRequire = createRequire(require.resolve('@vendure/email-plugin'));

const templates = path.join(__dirname, '../../../static/email/templates');
const env = {
    EMAIL_TRANSPORT: 'smtp',
    EMAIL_SMTP_HOST: 'smtp-host',
    EMAIL_SMTP_PORT: '2587',
    EMAIL_SMTP_SECURE: 'starttls',
    EMAIL_SMTP_USER: 'sender',
    EMAIL_SMTP_PASSWORD: 'abc123',
    EMAIL_FROM_ADDRESS: 'no-reply@example.org',
    EMAIL_FROM_NAME: 'mivend',
};

describe('password-reset and account-activation mails through the smtp transport', () => {
    const loader = new FileBasedTemplateLoader(templates);
    const generator = new HandlebarsMjmlGenerator();
    const { transport, fromAddress } = resolveEmailConfig(env, '/unused');
    const vars = { fromAddress, passwordResetUrl: 'https://manager.example.org/set-password' };

    afterEach(() => vi.restoreAllMocks());

    beforeEach(async () => {
        vi.spyOn(pluginRequire('nodemailer'), 'createTransport').mockImplementation(
            createTransport as never,
        );
        sendMail.mockClear();
        createTransport.mockClear();
        await generator.onInit({
            templateLoader: loader,
        } as unknown as InitializedEmailPluginOptions);
    });

    it.each([
        ['password-reset', 'Forgotten password reset', { passwordResetToken: 'tok1' }],
        ['email-verification', 'Please verify your email address', { verificationToken: 'tok1' }],
    ])(
        'renders %s and hands it to the smtp transport with the configured sender',
        async (type, subject, extra) => {
            const body = await loader.loadTemplate(
                new Injector(undefined as never),
                RequestContext.empty(),
                {
                    type,
                    templateName: 'body.hbs',
                    templateVars: {},
                },
            );
            const mail = await generator.generate('{{ fromAddress }}', subject, body, {
                ...vars,
                ...extra,
            });
            await new NodemailerEmailSender().send(
                { ...mail, recipient: 'user@example.org', attachments: [] },
                transport as SMTPTransportOptions,
            );

            expect(createTransport).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'smtp-host',
                    port: 2587,
                    secure: false,
                    requireTLS: true,
                    auth: { user: 'sender', pass: 'abc123' },
                }),
            );
            const sent = sendMail.mock.calls[0][0];
            expect(sent.from).toBe('"mivend" <no-reply@example.org>');
            expect(sent.to).toBe('user@example.org');
            expect(sent.html).toContain('tok1');
            if (type === 'password-reset')
                expect(sent.html).toContain('https://manager.example.org/set-password?token=tok1');
        },
    );
});
