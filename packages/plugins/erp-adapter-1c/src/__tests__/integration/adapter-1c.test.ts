import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Adapter1c } from '../../adapter-1c';

const fetchMock = vi.fn();
global.fetch = fetchMock as typeof fetch;

const options = { baseUrl: 'http://1c-test.local/', username: 'test', password: 'test' };

describe('Adapter1c', () => {
    let adapter: Adapter1c;

    beforeEach(() => {
        vi.clearAllMocks();
        adapter = new Adapter1c(options);
    });

    it('fetchChanges maps 1C products to ErpChangeSet events', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                value: [
                    {
                        Ref_Key: 'p-1',
                        Description: 'Тест',
                        Артикул: 'T-001',
                        ПометкаУдаления: false,
                    },
                ],
            }),
        });

        const result = await adapter.fetchChanges(new Date(0));

        expect(result.events).toHaveLength(1);
        expect(result.events[0].type).toBe('product.updated');
        expect(result.events[0].payload).toMatchObject({ productId: 'p-1', enabled: true });
    });

    it('fetchChanges throws on non-OK response', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => 'Unauthorized',
        });
        await expect(adapter.fetchChanges(new Date())).rejects.toThrow('1C HTTP 401');
    });

    it('pushOrder returns erpOrderId from 1C response', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ Ref_Key: 'erp-ref-456' }),
        });

        const result = await adapter.pushOrder({
            orderId: 'order-1',
            lines: [{ variantId: 'v-1', quantity: 2, unitPrice: 500 }],
        });

        expect(result.erpOrderId).toBe('erp-ref-456');
    });
});
