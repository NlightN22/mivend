import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_FILTERS, fetchOrdersPage } from '../../api/orders';

function mockOrders(): { filter: () => Record<string, unknown> } {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { visibleOrders: { totalItems: 0, items: [] } } }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    return {
        filter: () =>
            (
                JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
                    variables: { options: { filter: Record<string, unknown> } };
                }
            ).variables.options.filter,
    };
}

describe('orders list ERP requirements filter', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('is part of the URL-synced default filter set', () => {
        expect(DEFAULT_FILTERS).toHaveProperty('hasCheckFindings', '');
    });

    it('sends hasCheckFindings only when the chip is active', async () => {
        const off = mockOrders();
        await fetchOrdersPage({ ...DEFAULT_FILTERS }, 1, 10);
        expect(off.filter()).not.toHaveProperty('hasCheckFindings');

        const on = mockOrders();
        await fetchOrdersPage({ ...DEFAULT_FILTERS, hasCheckFindings: '1' }, 1, 10);
        expect(on.filter().hasCheckFindings).toEqual({ eq: true });
    });
});
