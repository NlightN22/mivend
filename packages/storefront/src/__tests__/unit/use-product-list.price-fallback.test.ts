import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

// Issue #70: ProductVariant.price must never surface the raw search-index price
// (`priceWithTax`) — it's a customer-agnostic placeholder under SEARCH_BACKEND=external and,
// even on the internal backend, is not the resolved price PriceResolutionService computes.
// The `search` resolver now always returns a real `customerPrice` (the customer's own, or the
// branch default-price-type fallback — see docs/pricing.md) except for a genuinely
// unconfigured/pre-bootstrap system, so mapItems() must read customerPrice, never priceWithTax.

function makeSearchItem(
    sku: string,
    opts: { priceWithTaxValue: number; customerPrice: number | null },
): {
    productId: string;
    productVariantId: string;
    productName: string;
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
                          // priceWithTax is 0 (the external-backend placeholder value, or simply
                          // stale relative to the resolved price) — customerPrice is the real
                          // resolved value and must be what's displayed.
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

    // Audit finding, mivend.audit.70: `?? 0` made an unresolved (null) customerPrice display as
    // 0, indistinguishable from a genuinely free product — must surface as undefined instead, so
    // downstream UI can render "no price" rather than "free".
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
