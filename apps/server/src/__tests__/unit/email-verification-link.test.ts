import path from 'path';
import { describe, expect, it } from 'vitest';
import { Injector, NativeAuthenticationMethod, RequestContext } from '@vendure/core';
import {
    FileBasedTemplateLoader,
    HandlebarsMjmlGenerator,
    InitializedEmailPluginOptions,
    emailVerificationHandler,
} from '@vendure/email-plugin';
import { emailGlobalTemplateVars } from '../../email-config';

const loader = new FileBasedTemplateLoader(path.join(__dirname, '../../../static/email/templates'));

describe('email-verification link target', () => {
    it('points the activation link at the storefront /verify page', async () => {
        const injector = {} as unknown as Injector;
        const ctx = {
            channel: { code: 'default' },
            languageCode: 'en',
            serialize: () => ({}),
        } as unknown as RequestContext;
        const method = new NativeAuthenticationMethod({
            identifier: 'user@example.org',
            verificationToken: 'tok1',
        });
        const user = {
            identifier: 'user@example.org',
            authenticationMethods: [method],
            getNativeAuthenticationMethod: () => method,
        };
        const event = { ctx, user } as unknown as Parameters<
            typeof emailVerificationHandler.handle
        >[0];
        const vars = emailGlobalTemplateVars('no-reply@example.org', 'https://shop.example.org');
        const details = await emailVerificationHandler.handle(event, vars, injector);
        if (!details) throw new Error('handler produced no mail');
        const generator = new HandlebarsMjmlGenerator();
        await generator.onInit({
            templateLoader: loader,
        } as unknown as InitializedEmailPluginOptions);
        const body = await loader.loadTemplate(injector, ctx, {
            type: details.type,
            templateName: details.templateFile,
            templateVars: details.templateVars,
        });
        const mail = await generator.generate(
            details.from,
            details.subject,
            body,
            details.templateVars,
        );
        expect(mail.body).toContain('https://shop.example.org/verify?token=tok1');
    });
});
