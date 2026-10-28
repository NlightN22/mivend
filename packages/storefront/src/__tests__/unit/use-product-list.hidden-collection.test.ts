import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

const shopApiMock = vi.fn();
vi.mock('../../api/client', () => ({ shopApi: (...args: unknown[]) => shopApiMock(...args) }));

vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
});

const product = {
    productId: '1',
    productVariantId: '1',
    productName: 'P',
    slug: 'p',
    sku: 'sku',
    manufacturer: null,
    galleryPreviews: [],
    facetValueIds: [],
    discountTiers: [],
    packagingLevels: [],
    currencyCode: 'USD',
    stockLevel: 'IN_STOCK',
};

function backend(collection: { id: string } | null): void {
    shopApiMock.mockImplementation((document: { toString(): string }) => {
        const query = String(document);
        if (query.includes('SearchCapabilities')) {
            return Promise.resolve({
                searchCapabilities: { sortKeys: ['relevance'], priceRange: false },
            });
        }
        if (query.includes('CatalogCollectionBySlug')) return Promise.resolve({ collection });
        return Promise.resolve({ search: { totalItems: 1, items: [product], facetValues: [] } });
    });
}

function searchCalls(): unknown[][] {
    return shopApiMock.mock.calls.filter(([doc]) =>
        /CatalogProducts|CatalogFacets/.test(String(doc)),
    );
}

describe('useProductList with a collection slug that does not resolve', () => {
    beforeEach(() => {
        shopApiMock.mockReset();
        vi.resetModules();
    });

    it('shows an empty result and runs no product or facet search', async () => {
        backend(null);
        const { useProductList } = await import('../../composables/useProductList');
        const list = useProductList({ collectionSlug: ref('hidden-cat') });
        await list.load();
        expect(list.items.value).toEqual([]);
        expect(list.totalItems.value).toBe(0);
        expect(list.hasMore.value).toBe(false);
        expect(list.loading.value).toBe(false);
        expect(list.loadError.value).toBe(false);
        expect(searchCalls()).toHaveLength(0);
        await list.loadMore();
        expect(searchCalls()).toHaveLength(0);
    });

    it('searches with the collection filter when the slug resolves', async () => {
        backend({ id: '5' });
        const { useProductList } = await import('../../composables/useProductList');
        const list = useProductList({ collectionSlug: ref('visible-cat') });
        await list.load();
        expect(list.items.value).toHaveLength(1);
        expect(
            searchCalls().every(
                ([, vars]) => (vars as { collectionSlug: string }).collectionSlug === 'visible-cat',
            ),
        ).toBe(true);
    });

    it('does not look the collection up when there is no slug', async () => {
        backend(null);
        const { useProductList } = await import('../../composables/useProductList');
        const list = useProductList({ collectionSlug: ref(undefined) });
        await list.load();
        expect(list.items.value).toHaveLength(1);
        expect(
            shopApiMock.mock.calls.some(([doc]) => String(doc).includes('CatalogCollectionBySlug')),
        ).toBe(false);
    });

    it('records a load error when the collection lookup fails', async () => {
        shopApiMock.mockImplementation((document: { toString(): string }) =>
            String(document).includes('CatalogCollectionBySlug')
                ? Promise.reject(new Error('boom'))
                : Promise.resolve({
                      searchCapabilities: { sortKeys: ['relevance'], priceRange: false },
                  }),
        );
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { useProductList } = await import('../../composables/useProductList');
        const list = useProductList({ collectionSlug: ref('x') });
        await expect(list.load()).rejects.toThrow('boom');
        expect(list.loadError.value).toBe(true);
        expect(searchCalls()).toHaveLength(0);
    });
});
