import { beforeEach, describe, expect, it, vi } from 'vitest';

const shopApi = vi.fn();
vi.mock('../../api/client', () => ({ shopApi: (...args: unknown[]) => shopApi(...args) }));

import { useWidgetProducts } from '../../composables/useWidgetProducts';

function product(id: string, previews: string[]): unknown {
    return {
        id,
        name: `Product ${id}`,
        slug: `product-${id}`,
        assets: previews.map(preview => ({ preview })),
        facetValues: [],
        variants: [],
    };
}

describe('useWidgetProducts images', () => {
    beforeEach(() => {
        shopApi.mockReset();
        shopApi.mockImplementation(async (document: string) => {
            if (document.includes('popularProductIds')) return { popularProductIds: ['2', '1'] };
            return {
                products: {
                    items: [product('1', ['/assets/a.jpg', '/assets/b.jpg?x=1']), product('2', [])],
                },
            };
        });
    });

    it('card photos come from the product assets, in the requested order', async () => {
        const widget = useWidgetProducts('popular');
        await widget.load();
        expect(widget.items.value.map(item => item.id)).toEqual(['2', '1']);
        expect(widget.items.value[0].images).toEqual([]);
        expect(widget.items.value[1].images).toEqual([
            '/assets/a.jpg?preset=small',
            '/assets/b.jpg?x=1&preset=small',
        ]);
    });
});
