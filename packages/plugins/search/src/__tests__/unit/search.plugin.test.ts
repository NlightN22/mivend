import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// searchPlugins is built once at module load; each case must vi.resetModules() to re-import.
// Only one backend plugin may be registered, so the test asserts the other is absent.
describe('search.plugin searchPlugins backend switch', () => {
    const ORIGINAL_BACKEND = process.env.SEARCH_BACKEND;
    const ORIGINAL_URL = process.env.SEARCH_SERVICE_URL;
    const ORIGINAL_KEY = process.env.SEARCH_SERVICE_API_KEY;

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        process.env.SEARCH_BACKEND = ORIGINAL_BACKEND;
        process.env.SEARCH_SERVICE_URL = ORIGINAL_URL;
        process.env.SEARCH_SERVICE_API_KEY = ORIGINAL_KEY;
    });

    // vi.resetModules() reimports the whole dependency graph, which can exceed the default 5s timeout.
    it('registers ElasticsearchPlugin (and not ExternalSearchPlugin) when SEARCH_BACKEND is unset', async () => {
        delete process.env.SEARCH_BACKEND;
        const { searchPlugins } = await import('../../search.plugin');
        const { ExternalSearchPlugin } = await import('../../external-search.plugin');

        expect(searchPlugins).toHaveLength(2);
        expect(searchPlugins).not.toContain(ExternalSearchPlugin);
        // The internal branch's first element is ElasticsearchPlugin.init(...)'s return
        // value — a plugin config object, not the ExternalSearchPlugin class.
        expect(searchPlugins[0]).not.toBe(ExternalSearchPlugin);
    }, 20000);

    it('registers ElasticsearchPlugin when SEARCH_BACKEND=internal', async () => {
        process.env.SEARCH_BACKEND = 'internal';
        const { searchPlugins } = await import('../../search.plugin');
        const { ExternalSearchPlugin } = await import('../../external-search.plugin');

        expect(searchPlugins).toHaveLength(2);
        expect(searchPlugins).not.toContain(ExternalSearchPlugin);
    }, 20000);

    it('registers ExternalSearchPlugin (and not ElasticsearchPlugin) when SEARCH_BACKEND=external', async () => {
        process.env.SEARCH_BACKEND = 'external';
        process.env.SEARCH_SERVICE_URL = 'http://search-service.test';
        process.env.SEARCH_SERVICE_API_KEY = 'test-key';
        const { searchPlugins, SearchPlugin } = await import('../../search.plugin');
        const { ExternalSearchPlugin } = await import('../../external-search.plugin');

        expect(searchPlugins).toEqual([SearchPlugin, ExternalSearchPlugin]);
    }, 20000);

    it('throws at module load when SEARCH_BACKEND=external but SEARCH_SERVICE_URL is missing', async () => {
        process.env.SEARCH_BACKEND = 'external';
        delete process.env.SEARCH_SERVICE_URL;

        await expect(import('../../search.plugin')).rejects.toThrow(/SEARCH_SERVICE_URL/);
    }, 20000);

    it('throws at module load when SEARCH_BACKEND=external but SEARCH_SERVICE_API_KEY is missing', async () => {
        process.env.SEARCH_BACKEND = 'external';
        process.env.SEARCH_SERVICE_URL = 'http://search-service.test';
        delete process.env.SEARCH_SERVICE_API_KEY;

        await expect(import('../../search.plugin')).rejects.toThrow(/SEARCH_SERVICE_API_KEY/);
    }, 20000);
});
