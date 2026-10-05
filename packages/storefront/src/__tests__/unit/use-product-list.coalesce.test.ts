import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';

const shopApiMock = vi.fn();
vi.mock('../../api/client', () => ({ shopApi: (...args: unknown[]) => shopApiMock(...args) }));

vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
});

function productsCalls(): unknown[] {
    return shopApiMock.mock.calls.filter(([doc]) => String(doc).includes('CatalogProducts'));
}

describe('useProductList coalesces triggers from the same tick', () => {
    beforeEach(() => {
        shopApiMock.mockReset();
        vi.resetModules();
        shopApiMock.mockImplementation((document: { toString(): string }) =>
            Promise.resolve(
                String(document).includes('SearchCapabilities')
                    ? { searchCapabilities: { sortKeys: ['relevance'], priceRange: false } }
                    : { search: { totalItems: 0, items: [], facetValues: [] } },
            ),
        );
    });

    it('sends one products request when query, collection and filters change together', async () => {
        const { useProductList } = await import('../../composables/useProductList');
        const query = ref('a');
        const collectionSlug = ref<string | undefined>(undefined);
        const filters = ref({ facetValueIds: [], inStock: false, priceMin: null, priceMax: null });
        useProductList({ query, collectionSlug, filters });

        query.value = 'b';
        collectionSlug.value = 'cat';
        filters.value = { ...filters.value, inStock: true };
        await nextTick();
        await vi.waitFor(() => expect(productsCalls()).toHaveLength(1));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(productsCalls()).toHaveLength(1);
    });
});
