import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

// This test exists because the load()/loadMore() race in useProductList.ts has
// recurred more than once (loadSeq was already added for load()'s own races
// before loadMore() needed the same guard) — an e2e test alone can't reliably
// catch a timing-dependent race, so this deterministically controls resolution
// order via manual promise resolvers instead of hoping a real network race lands.

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

function defer<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => {
        resolve = r;
    });
    return { promise, resolve };
}

function makeSearchItem(sku: string) {
    return {
        productId: sku,
        productVariantId: sku,
        productName: sku,
        slug: sku,
        sku,
        priceWithTax: { value: 1000 },
        currencyCode: 'RUB',
        inStock: true,
        facetValueIds: [],
        customerPrice: null,
        compareAtPrice: null,
        discountTiers: [],
    };
}

const shopApiMock = vi.fn();
vi.mock('../../api/client', () => ({ shopApi: (...args: unknown[]) => shopApiMock(...args) }));

// useProductList pulls in useViewMode(), which reads localStorage on init.
vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
});

function isFacetsQuery(query: string): boolean {
    return query.includes('CatalogFacets');
}

describe('useProductList load()/loadMore() race', () => {
    beforeEach(() => {
        shopApiMock.mockReset();
    });

    it('loadMore() does not fire while a load() is still in flight', async () => {
        const { useProductList } = await import('../../composables/useProductList');
        const filters = ref({ facetValueIds: [], inStock: false, priceMin: null, priceMax: null });
        const { load, loadMore, items } = useProductList({ pageSize: 2, filters });

        const productsDeferred = defer<{ search: unknown }>();
        shopApiMock.mockImplementation((query: string) =>
            isFacetsQuery(query)
                ? Promise.resolve({ search: { facetValues: [] } })
                : productsDeferred.promise,
        );

        const loadPromise = load(); // fetchProducts(0) is now pending (loading.value === true)

        await loadMore(); // must bail immediately — loading.value guard

        const productCalls = shopApiMock.mock.calls.filter(([q]) => !isFacetsQuery(q as string));
        expect(productCalls).toHaveLength(1); // only load()'s own call, loadMore() added nothing

        productsDeferred.resolve({
            search: {
                totalItems: 1,
                items: [makeSearchItem('SKU-A')],
                facetValues: [],
            },
        });
        await loadPromise;

        expect(items.value.map(i => i.variants[0].sku)).toEqual(['SKU-A']);
    });

    it('a loadMore() in flight is discarded (not appended) if a load() supersedes it first', async () => {
        const { useProductList } = await import('../../composables/useProductList');
        const filters = ref({ facetValueIds: [], inStock: false, priceMin: null, priceMax: null });
        const { load, loadMore, items } = useProductList({ pageSize: 1, filters });

        // First load() completes normally, leaving hasMore=true (1 item returned out
        // of a pageSize of 1, with more totalItems available) so loadMore() is legal.
        shopApiMock.mockImplementation((query: string) =>
            isFacetsQuery(query)
                ? Promise.resolve({ search: { facetValues: [] } })
                : Promise.resolve({
                      search: { totalItems: 3, items: [makeSearchItem('SKU-A')], facetValues: [] },
                  }),
        );
        await load();
        expect(items.value.map(i => i.variants[0].sku)).toEqual(['SKU-A']);

        // Now simulate: loadMore() starts (its fetch is pending) ...
        const loadMoreDeferred = defer<{ search: unknown }>();
        shopApiMock.mockImplementation((query: string) =>
            isFacetsQuery(query)
                ? Promise.resolve({ search: { facetValues: [] } })
                : loadMoreDeferred.promise,
        );
        const loadMorePromise = loadMore();

        // ... but a fresh load() (e.g. a filter change) fires and resolves before it.
        shopApiMock.mockImplementation((query: string) =>
            isFacetsQuery(query)
                ? Promise.resolve({ search: { facetValues: [] } })
                : Promise.resolve({
                      search: { totalItems: 1, items: [makeSearchItem('SKU-B')], facetValues: [] },
                  }),
        );
        await load();
        expect(items.value.map(i => i.variants[0].sku)).toEqual(['SKU-B']);

        // The stale loadMore() finally resolves — it must NOT append SKU-A onto the
        // list load() just replaced with SKU-B (this is the exact duplication bug).
        loadMoreDeferred.resolve({
            search: { totalItems: 3, items: [makeSearchItem('SKU-A')], facetValues: [] },
        });
        await loadMorePromise;

        expect(items.value.map(i => i.variants[0].sku)).toEqual(['SKU-B']);
    });
});
