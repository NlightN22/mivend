import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCatalogPage, DEFAULT_CATALOG_FILTERS } from '../../api/catalog';

// Test plan: the selected category must reach the search as collectionSlug (subtree match done by
// the server), never as a client-resolved facet value, which is missing for categories whose
// products are all absent from the facet aggregation and silently lists the whole catalog.
// Unit level: asserts the wire shape of the request body, same fetch mock style as client.test.ts.
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
