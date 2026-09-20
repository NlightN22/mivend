import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReconciliationSummaryClient } from '../../reconciliation-summary.client';
import type { ErpIntegrationPluginOptions } from '../../types';

const OPTIONS: ErpIntegrationPluginOptions = {
    instanceType: 'central',
    kafka: { brokers: ['x'], clientId: 'x', topic: 'x' },
    kafkaConsumer: {
        brokers: ['x'],
        clientId: 'x',
        groupId: 'x',
        topics: {
            category: 'c',
            organization: 'o',
            warehouse: 'w',
            'price-type': 'pt',
            product: 'p',
            offer: 'of',
            price: 'pr',
            stock: 's',
            'storage-location': 'sl',
            'stock-organization': 'so',
            'order-registration-result': 'orr',
            'order-changed': 'oc',
            department: 'dept',
            counterparty: 'cp',
        },
    },
    schemaRegistry: { url: 'http://x' },
    reconciliationApiUrl: 'https://is.test',
    reconciliationApiKey: 'secret-key',
};

afterEach(() => {
    vi.unstubAllGlobals();
});

// A transient failure here must never look like "0 discrepancies" to a caller — this client
// throws after exhausting retries, it never returns an empty/zeroed summary as a fallback (see
// external-integration-rules skill's no-silent-drops rule).
describe('ReconciliationSummaryClient.fetchSummaries', () => {
    it('sends the X-Api-Key header and the aggregateType query param', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                { aggregateType: 'product', count: 5, activeCount: 4, lastModifiedMax: null },
            ],
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new ReconciliationSummaryClient(OPTIONS);
        const result = await client.fetchSummaries('product');

        expect(result).toEqual([
            { aggregateType: 'product', count: 5, activeCount: 4, lastModifiedMax: null },
        ]);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain('aggregateType=product');
        expect(String(url)).not.toContain('excludeDeletedWarehouse');
        expect((init as { headers: Record<string, string> }).headers['X-Api-Key']).toBe(
            'secret-key',
        );
    });

    // Issue #90's follow-up (search-platform#111): "stock"'s activeCount otherwise counts stock
    // tied to a since-deleted warehouse, which mivend structurally can't track locally.
    it('adds excludeDeletedWarehouse=true only for aggregateType=stock', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
        vi.stubGlobal('fetch', fetchMock);

        const client = new ReconciliationSummaryClient(OPTIONS);
        await client.fetchSummaries('stock');

        const [url] = fetchMock.mock.calls[0];
        expect(String(url)).toContain('aggregateType=stock');
        expect(String(url)).toContain('excludeDeletedWarehouse=true');
    });

    it('retries a transient failure and succeeds on a later attempt', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('network blip'))
            .mockResolvedValueOnce({ ok: true, json: async () => [] });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
            fn();
            return 0 as unknown as NodeJS.Timeout;
        }) as never);

        const client = new ReconciliationSummaryClient(OPTIONS);
        const result = await client.fetchSummaries();

        expect(result).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws (never returns a fallback) after exhausting all retries', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('still down'));
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
            fn();
            return 0 as unknown as NodeJS.Timeout;
        }) as never);

        const client = new ReconciliationSummaryClient(OPTIONS);
        await expect(client.fetchSummaries('product')).rejects.toThrow('still down');
    });

    it('throws on a non-2xx response instead of returning an empty array', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            text: async () => 'service unavailable',
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
            fn();
            return 0 as unknown as NodeJS.Timeout;
        }) as never);

        const client = new ReconciliationSummaryClient(OPTIONS);
        await expect(client.fetchSummaries('product')).rejects.toThrow('503');
    });
});
