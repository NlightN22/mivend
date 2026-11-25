import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExchangePrioritiesClient } from '../../exchange-priorities.client';
import { MAX_PRIORITIES_BODY_BYTES, parseExchangePriorities } from '../../exchange-priorities';
import { ExchangePrioritiesService } from '../../exchange-priorities.service';
import { INBOX_TO_IS_STREAM } from '../../order-events-message';
import { mergeCandidates, parkedReserve } from '../../integration-inbox-claim-candidates';

const sample = {
    version: '2026-11-25T00:52:24.662Z',
    hash: '06E32B10+2178139b18d1',
    items: [
        { stream: 'catalog-currencies', level: 0, order: 4, eventStream: 'currency' },
        { stream: 'catalog-product-groups', level: 0, order: 66, eventStream: null },
        { stream: 'price', level: 3, order: 95, eventStream: 'price' },
        { stream: 'stock', level: 4, order: 108, eventStream: 'stock' },
        { stream: 'customer-order', level: 12, order: 185, eventStream: 'order' },
    ],
};

const options = { reconciliationApiUrl: 'https://is.example', integrationOpsApiKey: 'k' } as never;

function reply(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

afterEach(() => vi.unstubAllGlobals());

describe('parseExchangePriorities', () => {
    it('maps event streams to levels and ignores items without one', () => {
        const table = parseExchangePriorities(sample);
        expect(table.hash).toBe(sample.hash);
        expect(table.levels.get('currency')).toBe(0);
        expect(table.levels.get('price')).toBe(3);
        expect(table.levels.size).toBe(INBOX_TO_IS_STREAM.size + 4);
    });

    it('gives order-changed the level of the IS order stream through the declared alias', () => {
        expect(INBOX_TO_IS_STREAM.get('order-changed')).toBe('order');
        const table = parseExchangePriorities(sample);
        expect(table.levels.get('order-changed')).toBe(12);
    });

    it('does not invent an alias level when the IS stream is absent', () => {
        const table = parseExchangePriorities({ ...sample, items: [sample.items[0]] });
        expect(table.levels.has('order-changed')).toBe(false);
    });

    it.each([
        ['null body', null],
        ['missing hash', { items: [] }],
        ['items not a list', { hash: 'h', items: {} }],
        ['negative level', { hash: 'h', items: [{ level: -1, eventStream: 'a' }] }],
        ['fractional level', { hash: 'h', items: [{ level: 1.5, eventStream: 'a' }] }],
        ['string level', { hash: 'h', items: [{ level: '1', eventStream: 'a' }] }],
        ['non-string eventStream', { hash: 'h', items: [{ level: 1, eventStream: 7 }] }],
        ['non-object item', { hash: 'h', items: ['x'] }],
    ])('rejects %s', (_name, raw) => {
        expect(() => parseExchangePriorities(raw)).toThrow();
    });
});

describe('ExchangePrioritiesClient', () => {
    it('sends the key, the url-encoded hash, and maps 304 to unchanged', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
        vi.stubGlobal('fetch', fetchMock);
        const result = await new ExchangePrioritiesClient(options).fetchTable('a+b/c');
        expect(result).toEqual({ unchanged: true });
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(
            'https://is.example/api/ops/v1/exchange-priorities?hash=a%2Bb%2Fc',
        );
        expect(init.headers['X-Api-Key']).toBe('k');
        expect(init.redirect).toBe('error');
    });

    it('rejects an oversized body and a non-ok status', async () => {
        const client = new ExchangePrioritiesClient(options);
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    reply(200, sample, { 'content-length': String(MAX_PRIORITIES_BODY_BYTES + 1) }),
                ),
        );
        await expect(client.fetchTable(null)).rejects.toThrow(/size limit/);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(500)));
        await expect(client.fetchTable(null)).rejects.toThrow(/500/);
    });

    it('rejects a streamed body over the limit without a content-length', async () => {
        const huge = 'x'.repeat(MAX_PRIORITIES_BODY_BYTES + 10);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(huge, { status: 200 })));
        await expect(new ExchangePrioritiesClient(options).fetchTable(null)).rejects.toThrow(
            /size limit/,
        );
    });
});

describe('ExchangePrioritiesService', () => {
    it('starts empty, caches by hash, treats 304 as unchanged and keeps the table on failure', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const service = new ExchangePrioritiesService(
            new ExchangePrioritiesClient(options),
            options,
        );
        fetchMock.mockResolvedValueOnce(reply(200, sample));
        await service.refresh();
        expect(service.getLevels().get('price')).toBe(3);

        fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
        await service.refresh();
        expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('hash=06E32B10%2B2178139b18d1');
        expect(service.getLevels().get('price')).toBe(3);

        fetchMock.mockRejectedValueOnce(new Error('down'));
        await service.refresh();
        fetchMock.mockResolvedValueOnce(reply(200, { bad: true }));
        await service.refresh();
        expect(service.getLevels().get('price')).toBe(3);
    });

    it('never fetches when not configured', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const bare = {} as never;
        const service = new ExchangePrioritiesService(new ExchangePrioritiesClient(bare), bare);
        expect(service.getLevels().size).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('mergeCandidates', () => {
    const ids = (prefix: string, n: number): string[] =>
        Array.from({ length: n }, (_, i) => `${prefix}${i}`);

    it('reserves a quarter of the batch for parked rows when pending is large', () => {
        const out = mergeCandidates(ids('p', 20), ids('d', 20), 20);
        expect(parkedReserve(20)).toBe(5);
        expect(out.filter(i => i.startsWith('d'))).toHaveLength(5);
        expect(out).toHaveLength(20);
    });

    it('hands unused slots to the other side', () => {
        expect(mergeCandidates(ids('p', 3), ids('d', 20), 20)).toHaveLength(20);
        expect(mergeCandidates(ids('p', 20), ids('d', 1), 20)).toHaveLength(20);
        expect(mergeCandidates(ids('p', 20), [], 20).every(i => i.startsWith('p'))).toBe(true);
    });
});
