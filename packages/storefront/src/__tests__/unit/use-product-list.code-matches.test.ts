import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

const shopApiMock = vi.fn();
vi.mock('../../api/client', () => ({ shopApi: (...args: unknown[]) => shopApiMock(...args) }));

vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
});

function hit(productId: string): Record<string, unknown> {
    return {
        productId,
        productVariantId: `v${productId}`,
        productName: `P${productId}`,
        slug: `p${productId}`,
        sku: `S${productId}`,
        currencyCode: 'RUB',
        stockLevel: 'none',
        galleryPreviews: [],
        facetValueIds: [],
        discountTiers: [],
        matchReasons: [],
    };
}

describe('useProductList code matches (#307)', () => {
    beforeEach(() => {
        shopApiMock.mockReset();
        vi.resetModules();
    });

    function respond(search: Record<string, unknown>): void {
        shopApiMock.mockImplementation((document: { toString(): string }) =>
            Promise.resolve(
                String(document).includes('SearchCapabilities')
                    ? { searchCapabilities: { sortKeys: ['relevance'], priceRange: false } }
                    : { search: { facetValues: [], collections: [], ...search } },
            ),
        );
    }

    it('lists code groups first in priority order, then full text, with summed totals', async () => {
        respond({
            totalItems: 5,
            items: [hit('4')],
            skuMatches: { total: 1, items: [hit('1')] },
            partNumberMatches: { total: 1, items: [hit('2')] },
            manufacturerCodeMatches: { total: 1, items: [hit('3')] },
        });
        const { useProductList } = await import('../../composables/useProductList');
        const list = useProductList({ query: ref('48.3855') });
        await list.load();
        expect(list.items.value.map(i => [i.id, i.codeMatch])).toEqual([
            ['1', 'sku'],
            ['2', 'partNumber'],
            ['3', 'manufacturerCode'],
            ['4', undefined],
        ]);
        expect(list.totalItems.value).toBe(8);
        expect(list.hasCodeMatches.value).toBe(true);
    });

    it('pages over the full-text part only and never re-adds the code groups', async () => {
        const text = Array.from({ length: 24 }, (_, i) => hit(`t${i}`));
        respond({
            totalItems: 30,
            items: text,
            skuMatches: { total: 1, items: [hit('1')] },
        });
        const { useProductList } = await import('../../composables/useProductList');
        const list = useProductList({ query: ref('48.3855') });
        await list.load();
        expect(list.hasMore.value).toBe(true);
        respond({ totalItems: 30, items: [hit('more')] });
        await list.loadMore();
        const calls = shopApiMock.mock.calls.filter(([d]) => String(d).includes('CatalogProducts'));
        expect(calls[1][1]).toMatchObject({ skip: 24 });
        expect(list.items.value).toHaveLength(26);
        expect(list.items.value.filter(i => i.codeMatch)).toHaveLength(1);
    });

    it('flags a group cut at the server limit', async () => {
        respond({ totalItems: 0, items: [], skuMatches: { total: 150, items: [hit('1')] } });
        const { useProductList } = await import('../../composables/useProductList');
        const list = useProductList({ query: ref('A1') });
        await list.load();
        expect(list.codeMatchesTruncated.value).toBe(true);
    });

    it('stays unchanged for a text-only query without groups', async () => {
        respond({ totalItems: 1, items: [hit('1')] });
        const { useProductList } = await import('../../composables/useProductList');
        const list = useProductList({ query: ref('oil') });
        await list.load();
        expect(list.hasCodeMatches.value).toBe(false);
        expect(list.totalItems.value).toBe(1);
    });
});
