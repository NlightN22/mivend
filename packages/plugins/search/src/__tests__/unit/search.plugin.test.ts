import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// searchPlugins is built once at module load; each case must vi.resetModules() to re-import.
// Only one backend plugin may be registered, so the test asserts the other is absent.
const KEY_ENVS = [
    'SEARCH_SERVICE_API_KEY_PUBLIC',
    'SEARCH_SERVICE_API_KEY_STOREFRONT',
    'SEARCH_SERVICE_API_KEY_MANAGER',
];

describe('search.plugin searchPlugins backend switch', () => {
    const ORIGINAL_BACKEND = process.env.SEARCH_BACKEND;
    const ORIGINAL_URL = process.env.SEARCH_SERVICE_URL;
    const ORIGINAL_KEYS = KEY_ENVS.map(name => process.env[name]);

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        process.env.SEARCH_BACKEND = ORIGINAL_BACKEND;
        process.env.SEARCH_SERVICE_URL = ORIGINAL_URL;
        KEY_ENVS.forEach((name, i) => {
            const original = ORIGINAL_KEYS[i];
            if (original === undefined) delete process.env[name];
            else process.env[name] = original;
        });
    });

    // vi.resetModules() reimports the whole dependency graph, which can exceed the default 5s timeout.
    it('registers ElasticsearchPlugin (and not ExternalSearchPlugin) when SEARCH_BACKEND is unset', async () => {
        delete process.env.SEARCH_BACKEND;
        const { searchPlugins } = await import('../../search.plugin');
        const { ExternalSearchPlugin } = await import('../../external-search.plugin');

        expect(searchPlugins).toHaveLength(3);
        expect(searchPlugins).not.toContain(ExternalSearchPlugin);
        // The internal branch's first element is ElasticsearchPlugin.init(...)'s return
        // value — a plugin config object, not the ExternalSearchPlugin class.
        expect(searchPlugins[0]).not.toBe(ExternalSearchPlugin);
    }, 20000);

    it('registers ElasticsearchPlugin when SEARCH_BACKEND=internal', async () => {
        process.env.SEARCH_BACKEND = 'internal';
        const { searchPlugins } = await import('../../search.plugin');
        const { ExternalSearchPlugin } = await import('../../external-search.plugin');

        expect(searchPlugins).toHaveLength(3);
        expect(searchPlugins).not.toContain(ExternalSearchPlugin);
    }, 20000);

    it('registers ExternalSearchPlugin (and not ElasticsearchPlugin) when SEARCH_BACKEND=external', async () => {
        process.env.SEARCH_BACKEND = 'external';
        process.env.SEARCH_SERVICE_URL = 'http://search-service.test';
        for (const name of KEY_ENVS) process.env[name] = 'test-key';
        const { searchPlugins, SearchPlugin } = await import('../../search.plugin');
        const { ExternalSearchPlugin } = await import('../../external-search.plugin');

        expect(searchPlugins).toEqual([SearchPlugin, ExternalSearchPlugin]);
    }, 20000);

    it('throws at module load when SEARCH_BACKEND=external but SEARCH_SERVICE_URL is missing', async () => {
        process.env.SEARCH_BACKEND = 'external';
        delete process.env.SEARCH_SERVICE_URL;

        await expect(import('../../search.plugin')).rejects.toThrow(/SEARCH_SERVICE_URL/);
    }, 20000);

    it('throws at module load when SEARCH_BACKEND=external but a role API key is missing', async () => {
        process.env.SEARCH_BACKEND = 'external';
        process.env.SEARCH_SERVICE_URL = 'http://search-service.test';
        delete process.env.SEARCH_SERVICE_API_KEY_PUBLIC;

        await expect(import('../../search.plugin')).rejects.toThrow(
            /SEARCH_SERVICE_API_KEY_PUBLIC/,
        );
    }, 20000);
});
