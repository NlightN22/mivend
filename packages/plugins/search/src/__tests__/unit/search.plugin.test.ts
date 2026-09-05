import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #69, test-design coverage area 4: SEARCH_BACKEND=internal (or unset) registers
// ElasticsearchPlugin exactly as before; SEARCH_BACKEND=external registers ExternalSearchPlugin
// instead, never both. searchPlugins is built once at module load (bootstrap), so each case
// re-imports the module fresh via vi.resetModules().
describe('search.plugin searchPlugins backend switch', () => {
    const ORIGINAL_BACKEND = process.env.SEARCH_BACKEND;
    const ORIGINAL_URL = process.env.SEARCH_SERVICE_URL;

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        process.env.SEARCH_BACKEND = ORIGINAL_BACKEND;
        process.env.SEARCH_SERVICE_URL = ORIGINAL_URL;
    });

    // vi.resetModules() forces a full reimport of the plugin's dependency graph (Vendure core,
    // GraphQL, CrossReferenceService, PriceEntryPlugin) each time — slower than the default 5s
    // test timeout under a full `make test` run, hence the explicit longer timeout below.
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
        const { searchPlugins, SearchPlugin } = await import('../../search.plugin');
        const { ExternalSearchPlugin } = await import('../../external-search.plugin');

        expect(searchPlugins).toEqual([SearchPlugin, ExternalSearchPlugin]);
    }, 20000);

    it('throws at module load when SEARCH_BACKEND=external but SEARCH_SERVICE_URL is missing', async () => {
        process.env.SEARCH_BACKEND = 'external';
        delete process.env.SEARCH_SERVICE_URL;

        await expect(import('../../search.plugin')).rejects.toThrow(/SEARCH_SERVICE_URL/);
    }, 20000);
});
