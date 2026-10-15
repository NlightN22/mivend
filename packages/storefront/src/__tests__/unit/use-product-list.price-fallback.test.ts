import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

// priceWithTax is a customer-agnostic placeholder (external backend), not the resolved price.
// customerPrice is the resolved value; null only before system bootstrap.

function makeSearchItem(
    sku: string,
    opts: { priceWithTaxValue: number; customerPrice: number | null },
): {
    productId: string;
    productVariantId: string;
    productName: string;
    galleryPreviews: string[];
    slug: string;
    sku: string;
    priceWithTax: { value: number };
    currencyCode: string;
    inStock: boolean;
    facetValueIds: string[];
    customerPrice: number | null;
    compareAtPrice: null;
    discountTiers: unknown[];
} {
    return {
        productId: sku,
        productVariantId: sku,
        productName: sku,
        galleryPreviews: [],
        slug: sku,
        sku,
        priceWithTax: { value: opts.priceWithTaxValue },
        currencyCode: 'RUB',
        inStock: true,
        facetValueIds: [],
        customerPrice: opts.customerPrice,
        compareAtPrice: null,
        discountTiers: [],
    };
}

const shopApiMock = vi.fn();
vi.mock('../../api/client', () => ({ shopApi: (...args: unknown[]) => shopApiMock(...args) }));

vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
});

function isFacetsQuery(query: string): boolean {
    return query.includes('CatalogFacets');
}

describe('useProductList mapItems — issue #70 raw price fallback', () => {
    beforeEach(() => {
        shopApiMock.mockReset();
    });

    it('uses the resolved customerPrice, never the raw search-index priceWithTax, when both differ', async () => {
        const { useProductList } = await import('../../composables/useProductList');
        const filters = ref({ facetValueIds: [], inStock: false, priceMin: null, priceMax: null });
        const { load, items } = useProductList({ pageSize: 24, filters });

        shopApiMock.mockImplementation((query: string) =>
            isFacetsQuery(query)
                ? Promise.resolve({ search: { facetValues: [] } })
                : Promise.resolve({
                      search: {
                          totalItems: 1,
                          // priceWithTax can be a 0 placeholder or stale; customerPrice is the value to display.
                          items: [
                              makeSearchItem('SKU-A', {
                                  priceWithTaxValue: 0,
                                  customerPrice: 1234,
                              }),
                          ],
                          facetValues: [],
                      },
                  }),
        );

        await load();

        expect(items.value[0].variants[0].price).toBe(1234);
    });

    it('never surfaces a raw non-zero priceWithTax either, even when customerPrice happens to be 0', async () => {
        const { useProductList } = await import('../../composables/useProductList');
        const filters = ref({ facetValueIds: [], inStock: false, priceMin: null, priceMax: null });
        const { load, items } = useProductList({ pageSize: 24, filters });

        shopApiMock.mockImplementation((query: string) =>
            isFacetsQuery(query)
                ? Promise.resolve({ search: { facetValues: [] } })
                : Promise.resolve({
                      search: {
                          totalItems: 1,
                          items: [
                              makeSearchItem('SKU-B', {
                                  priceWithTaxValue: 9999,
                                  customerPrice: 0,
                              }),
                          ],
                          facetValues: [],
                      },
                  }),
        );

        await load();

        expect(items.value[0].variants[0].price).toBe(0);
        expect(items.value[0].variants[0].price).not.toBe(9999);
    });

    // Keep null as undefined: a 0 fallback would render an unresolved price as a free product.
    it('maps a null (unresolved) customerPrice to undefined, never 0', async () => {
        const { useProductList } = await import('../../composables/useProductList');
        const filters = ref({ facetValueIds: [], inStock: false, priceMin: null, priceMax: null });
        const { load, items } = useProductList({ pageSize: 24, filters });

        shopApiMock.mockImplementation((query: string) =>
            isFacetsQuery(query)
                ? Promise.resolve({ search: { facetValues: [] } })
                : Promise.resolve({
                      search: {
                          totalItems: 1,
                          items: [
                              makeSearchItem('SKU-C', {
                                  priceWithTaxValue: 9999,
                                  customerPrice: null,
                              }),
                          ],
                          facetValues: [],
                      },
                  }),
        );

        await load();

        expect(items.value[0].variants[0].price).toBeUndefined();
        expect(items.value[0].variants[0].price).not.toBe(0);
    });
});
