import { afterEach, describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { siteLanguageSnapshot } from '@mivend/plugin-site-language';
import { resolveEmailLanguage } from '../../email-language';

const requestWith = (languageCode?: string): RequestContext =>
    ({ apiType: 'shop', req: { query: { languageCode } } }) as unknown as RequestContext;
const background = { apiType: 'shop' } as unknown as RequestContext;

afterEach(() => {
    siteLanguageSnapshot.value = undefined;
});

describe('mail language order: request, Global Settings default, env default', () => {
    it('a request languageCode beats the Global Settings default', () => {
        siteLanguageSnapshot.value = 'ru';
        expect(resolveEmailLanguage(requestWith('en'), 'en')).toBe('en');
    });

    it('uses the Global Settings default when the request names no language', () => {
        siteLanguageSnapshot.value = 'ru';
        expect(resolveEmailLanguage(requestWith(), 'en')).toBe('ru');
    });

    it('background mails use the Global Settings default', () => {
        siteLanguageSnapshot.value = 'ru';
        expect(resolveEmailLanguage(background, 'en')).toBe('ru');
    });

    it('uses the Global Settings default for admin-api requests, which always send en', () => {
        siteLanguageSnapshot.value = 'ru';
        const admin = { apiType: 'admin', req: { query: { languageCode: 'en' } } };
        expect(resolveEmailLanguage(admin as unknown as RequestContext, 'en')).toBe('ru');
    });

    it('falls back to the env default when the setting is unset', () => {
        expect(resolveEmailLanguage(background, 'ru')).toBe('ru');
    });

    it('ignores an unsupported request language and takes the settings default', () => {
        siteLanguageSnapshot.value = 'ru';
        expect(resolveEmailLanguage(requestWith('de'), 'en')).toBe('ru');
    });
});
