import path from 'path';
import { describe, expect, it } from 'vitest';
import { Injector, RequestContext } from '@vendure/core';
import {
    FileBasedTemplateLoader,
    HandlebarsMjmlGenerator,
    InitializedEmailPluginOptions,
} from '@vendure/email-plugin';
import { createPasswordResetHandler } from '../../password-reset-handler';

const urls = {
    staff: 'https://manager.example.org/set-password',
    customer: 'https://shop.example.org/set-password',
};
const loader = new FileBasedTemplateLoader(path.join(__dirname, '../../../static/email/templates'));

async function renderedLink(isStaff: boolean): Promise<string> {
    const injector = {
        get: () => ({ getRepository: () => ({ exists: async () => isStaff }) }),
    } as unknown as Injector;
    const ctx = {
        channel: { code: 'default' },
        languageCode: 'en',
        serialize: () => ({}),
    } as unknown as RequestContext;
    const user = {
        id: 7,
        identifier: 'user@example.org',
        getNativeAuthenticationMethod: () => ({ passwordResetToken: 'tok1' }),
    };
    const event = { ctx, user } as unknown as Parameters<
        ReturnType<typeof createPasswordResetHandler>['handle']
    >[0];
    const details = await createPasswordResetHandler(urls).handle(
        event,
        { fromAddress: 'no-reply@example.org' },
        injector,
    );
    if (!details) throw new Error('handler produced no mail');
    const generator = new HandlebarsMjmlGenerator();
    await generator.onInit({ templateLoader: loader } as unknown as InitializedEmailPluginOptions);
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
    return mail.body;
}

describe('password-reset link target', () => {
    it('points staff to the manager portal', async () => {
        const html = await renderedLink(true);
        expect(html).toContain('https://manager.example.org/set-password?token=tok1');
        expect(html).not.toContain('shop.example.org');
    });

    it('points customers to the storefront', async () => {
        const html = await renderedLink(false);
        expect(html).toContain('https://shop.example.org/set-password?token=tok1');
        expect(html).not.toContain('manager.example.org');
    });
});
