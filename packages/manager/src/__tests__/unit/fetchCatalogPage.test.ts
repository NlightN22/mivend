import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCatalogPage, DEFAULT_CATALOG_FILTERS } from '../../api/catalog';

// Send the category as collectionSlug (server-side subtree match), not a facet value.
// Missing facet values for empty-aggregation categories silently list the whole catalog.
function mockSearch(): { body: () => { variables: Record<string, unknown> } } {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { search: { totalItems: 0, items: [] } } }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    return { body: () => JSON.parse(fetchMock.mock.calls[0][1].body as string) };
}

describe('fetchCatalogPage', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('sends the selected category as collectionSlug without facet filters', async () => {
        const sent = mockSearch();
        await fetchCatalogPage(DEFAULT_CATALOG_FILTERS, [], 1, 20, 'cat-cat-engine-oils-mineral');
        expect(sent.body().variables).toMatchObject({
            collectionSlug: 'cat-cat-engine-oils-mineral',
        });
        expect(sent.body().variables.facetValueFilters ?? []).toEqual([]);
    });

    it('omits collectionSlug when no category is selected', async () => {
        const sent = mockSearch();
        await fetchCatalogPage(DEFAULT_CATALOG_FILTERS, [], 1, 20);
        expect(sent.body().variables.collectionSlug).toBeUndefined();
    });
});
