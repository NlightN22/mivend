import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shopApi } from '../../api/client';
import { useWidgetProducts } from '../../composables/useWidgetProducts';

vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));

const product = (id: string): unknown => ({
    id,
    name: id,
    slug: id,
    variants: [],
    facetValues: [],
});

function serverReturns(idsField: string, ids: string[], visible: string[]): void {
    vi.mocked(shopApi).mockImplementation(async (document: unknown) => {
        const text = String(document);
        if (text.includes(idsField)) return { [idsField]: ids } as never;
        return { products: { items: visible.map(product) } } as never;
    });
}

beforeEach(() => vi.mocked(shopApi).mockReset());

describe('useWidgetProducts server-scoped ids', () => {
    it.each([
        ['new-arrivals', 'newArrivalProductIds'],
        ['sales', 'saleProductIds'],
        ['popular', 'popularProductIds'],
    ] as const)(
        '%s keeps the server order and drops ids hidden from the viewer',
        async (mode, field) => {
            serverReturns(field, ['3', '1', '2'], ['1', '2', '3']);
            const widget = useWidgetProducts(mode);

            await widget.load();

            expect(widget.items.value.map(item => item.id)).toEqual(['3', '1', '2']);
        },
    );

    it('drops products the products query no longer returns', async () => {
        serverReturns('newArrivalProductIds', ['3', '1', '2'], ['1', '3']);
        const widget = useWidgetProducts('new-arrivals');

        await widget.load();

        expect(widget.items.value.map(item => item.id)).toEqual(['3', '1']);
    });

    it('trims the overfetched ids to the widget size', async () => {
        const ids = Array.from({ length: 30 }, (_, i) => String(i));
        serverReturns('newArrivalProductIds', ids, ids);
        const widget = useWidgetProducts('new-arrivals');

        await widget.load();

        expect(widget.items.value).toHaveLength(12);
        expect(widget.items.value[0].id).toBe('0');
    });

    it('is empty, without a products call, when the server returns no ids', async () => {
        serverReturns('newArrivalProductIds', [], []);
        const widget = useWidgetProducts('new-arrivals');

        await widget.load();

        expect(widget.items.value).toEqual([]);
        expect(shopApi).toHaveBeenCalledTimes(1);
    });
});
