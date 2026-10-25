import { RequestContext } from '@vendure/core';
import { FileBasedTemplateLoader } from '@vendure/email-plugin';

type Env = Record<string, string | undefined>;

export const EMAIL_LANGUAGES = ['en', 'ru'] as const;
export type EmailLanguage = (typeof EMAIL_LANGUAGES)[number];

const FALLBACK_LANGUAGE: EmailLanguage = 'en';

function supported(code: string | undefined): EmailLanguage | undefined {
    const base = code?.toLowerCase().split(/[-_]/)[0];
    return EMAIL_LANGUAGES.find(language => language === base);
}

export function defaultEmailLanguage(env: Env): EmailLanguage {
    const value = env.SITE_DEFAULT_LANGUAGE;
    if (!value) return FALLBACK_LANGUAGE;
    const language = EMAIL_LANGUAGES.find(candidate => candidate === value);
    if (!language) {
        throw new Error(`SITE_DEFAULT_LANGUAGE must be one of ${EMAIL_LANGUAGES.join(', ')}`);
    }
    return language;
}

// Vendure fills ctx.languageCode with the channel default when the request names none, so read the query.
// The Dashboard always sends languageCode=en, so admin-api requests use the deployment default.
export function resolveEmailLanguage(ctx: RequestContext, fallback: EmailLanguage): EmailLanguage {
    if (ctx.apiType === 'admin') return fallback;
    const requested = ctx.req?.query?.languageCode;
    return supported(typeof requested === 'string' ? requested : undefined) ?? fallback;
}

export class LanguageTemplateLoader extends FileBasedTemplateLoader {
    override loadTemplate(
        ...[injector, ctx, input]: Parameters<FileBasedTemplateLoader['loadTemplate']>
    ): Promise<string> {
        const language = supported(String(input.templateVars.emailLanguage)) ?? FALLBACK_LANGUAGE;
        const templateName = input.templateName.replace(/\.hbs$/, `.${language}.hbs`);
        return super.loadTemplate(injector, ctx, { ...input, templateName });
    }
}
