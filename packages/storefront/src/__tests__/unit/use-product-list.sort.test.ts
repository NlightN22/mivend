import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';

const shopApiMock = vi.fn();
vi.mock('../../api/client', () => ({ shopApi: (...args: unknown[]) => shopApiMock(...args) }));

vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
});

function mockBackend(capabilities: { sortKeys: string[]; priceRange: boolean }): void {
    shopApiMock.mockImplementation((document: { toString(): string }) => {
        const query = String(document);
        if (query.includes('SearchCapabilities')) {
            return Promise.resolve({ searchCapabilities: capabilities });
        }
        return Promise.resolve({ search: { totalItems: 0, items: [], facetValues: [] } });
    });
}

function productsVariables(): Record<string, unknown> {
    const call = shopApiMock.mock.calls
        .filter(([doc]) => String(doc).includes('CatalogProducts'))
        .at(-1);
    return call?.[1] as Record<string, unknown>;
}

const priceFilters = { facetValueIds: [], inStock: false, priceMin: 10, priceMax: 50 };

describe('useProductList sort and price range follow the backend capabilities', () => {
    beforeEach(() => {
        shopApiMock.mockReset();
        vi.resetModules();
    });

    it('sends the selected sort and the price range when the backend supports them', async () => {
        mockBackend({ sortKeys: ['relevance', 'name_asc', 'price_desc'], priceRange: true });
        const { useProductList } = await import('../../composables/useProductList');
        const { load, sortKey, sortOptions } = useProductList({
            filters: ref({ ...priceFilters }),
        });

        await load();
        expect(productsVariables().sort).toBeUndefined();
        expect(productsVariables().priceRangeWithTax).toEqual({ min: 1000, max: 5000 });
        expect(sortOptions.value.map(o => o.value)).toEqual([
            'relevance',
            'name_asc',
            'price_desc',
        ]);

        sortKey.value = 'price_desc';
        await nextTick();
        await vi.waitFor(() => expect(productsVariables().sort).toEqual({ price: 'DESC' }));
    });

    it('omits the price range and offers only supported sorts when the backend lacks price support', async () => {
        mockBackend({ sortKeys: ['relevance', 'name_asc', 'name_desc'], priceRange: false });
        const { useProductList } = await import('../../composables/useProductList');
        const { load, priceRangeSupported, sortOptions } = useProductList({
            filters: ref({ ...priceFilters }),
        });

        await load();
        expect(priceRangeSupported.value).toBe(false);
        expect(productsVariables().priceRangeWithTax).toBeUndefined();
        expect(sortOptions.value.map(o => o.label)).toEqual(['Relevance', 'Name A-Z', 'Name Z-A']);
    });

    it('falls back to relevance only when the capabilities query fails', async () => {
        shopApiMock.mockImplementation((document: { toString(): string }) =>
            String(document).includes('SearchCapabilities')
                ? Promise.reject(new Error('down'))
                : Promise.resolve({ search: { totalItems: 0, items: [], facetValues: [] } }),
        );
        const { useProductList } = await import('../../composables/useProductList');
        const { load, sortOptions, priceRangeSupported } = useProductList({
            filters: ref({ ...priceFilters }),
        });

        await load();
        expect(sortOptions.value.map(o => o.value)).toEqual(['relevance']);
        expect(priceRangeSupported.value).toBe(false);
    });
});
