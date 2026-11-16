import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalSettingsService, Permission } from '@vendure/core';
import type { Injector, RequestContext, RuntimeVendureConfig } from '@vendure/core';
import { buildSchema, GraphQLObjectType } from 'graphql';
import { print } from 'graphql';

import { siteLanguageSchema } from '../../api/schema';
import { addDefaultLanguageField } from '../../site-language-custom-field';
import { SiteLanguageResolver } from '../../site-language.resolver';
import { SiteLanguageService } from '../../site-language.service';
import { siteLanguageSnapshot } from '../../types';

type Field = { validate: (v: string, i: Injector, c: RequestContext) => Promise<string | void> };

function field(): Field & { options: Array<{ value: string }> } {
    const config = { customFields: {} } as unknown as RuntimeVendureConfig;
    addDefaultLanguageField(config);
    return config.customFields.GlobalSettings?.[0] as never;
}

function injectorWith(availableLanguages: string[]): Injector {
    const service = { getSettings: async () => ({ availableLanguages }) };
    return {
        get: (token: unknown) => (token === GlobalSettingsService ? service : undefined),
    } as unknown as Injector;
}

afterEach(() => {
    siteLanguageSnapshot.value = undefined;
});

describe('defaultLanguage custom field', () => {
    const ctx = {} as RequestContext;

    it('offers the supported site languages as standard options', () => {
        expect(field().options.map(o => o.value)).toEqual(['en', 'ru']);
    });

    it('accepts a language that is in Available Languages', async () => {
        expect(await field().validate('ru', injectorWith(['en', 'ru']), ctx)).toBeUndefined();
    });

    it('rejects a language that is not in Available Languages', async () => {
        expect(await field().validate('ru', injectorWith(['en']), ctx)).toMatch(/Available/);
    });

    it('accepts unsetting the value', async () => {
        expect(await field().validate('', injectorWith(['en']), ctx)).toBeUndefined();
    });
});

describe('siteDefaultLanguage public query', () => {
    it('is a single nullable String field, so it can expose nothing else', () => {
        const sdl = `type Query { _: Boolean }\n${print(siteLanguageSchema)}`;
        const query = buildSchema(sdl).getType('Query') as GraphQLObjectType;
        const field = query.getFields().siteDefaultLanguage;
        expect(String(field.type)).toBe('String');
        expect(field.args).toHaveLength(0);
    });

    it('is open to unauthenticated callers', () => {
        const permissions = Reflect.getMetadata(
            '__permissions__',
            SiteLanguageResolver.prototype.siteDefaultLanguage,
        );
        expect(permissions).toEqual([Permission.Public]);
    });

    it('returns the language string or null, nothing else', async () => {
        const service = { getDefault: vi.fn().mockResolvedValue('ru') };
        const resolver = new SiteLanguageResolver(service as unknown as SiteLanguageService);
        expect(await resolver.siteDefaultLanguage()).toBe('ru');
        service.getDefault.mockResolvedValue(undefined);
        expect(await resolver.siteDefaultLanguage()).toBeNull();
    });
});

describe('SiteLanguageService cache', () => {
    function build(language: unknown): {
        service: SiteLanguageService;
        read: ReturnType<typeof vi.fn>;
    } {
        const read = vi.fn().mockResolvedValue({ customFields: { defaultLanguage: language } });
        const service = new SiteLanguageService({ getSettings: read } as never, {} as never);
        return { service, read };
    }

    it('reads the settings once within the cache window', async () => {
        const { service, read } = build('ru');
        expect(await service.getDefault()).toBe('ru');
        expect(await service.getDefault()).toBe('ru');
        expect(read).toHaveBeenCalledTimes(1);
    });

    it('ignores a stored value that is not a supported language', async () => {
        const { service } = build('de');
        expect(await service.getDefault()).toBeUndefined();
    });
});
