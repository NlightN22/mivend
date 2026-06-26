import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Adapter1c } from '../../adapter-1c';

type QueuedResponse = { status: number; body: unknown; delayMs?: number };

let server: Server;
let baseUrl: string;
let capturedRequests: Array<{
    method: string;
    url: string;
    body: string;
    headers: Record<string, string>;
}> = [];
let responseQueue: QueuedResponse[] = [];

function enqueue(status: number, body: unknown, delayMs = 0): void {
    responseQueue.push({ status, body, delayMs });
}

function makeAdapter(overrides: Partial<{ timeoutMs: number }> = {}): Adapter1c {
    return new Adapter1c({ baseUrl, username: 'admin', password: 'secret', ...overrides });
}

beforeAll(
    () =>
        new Promise<void>(resolve => {
            server = createServer((req: IncomingMessage, res: ServerResponse) => {
                const chunks: Buffer[] = [];
                req.on('data', (c: Buffer) => chunks.push(c));
                req.on('end', async () => {
                    capturedRequests.push({
                        method: req.method ?? '',
                        url: req.url ?? '',
                        body: Buffer.concat(chunks).toString(),
                        headers: req.headers as Record<string, string>,
                    });
                    const next = responseQueue.shift();
                    if (!next) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: 'No response queued' }));
                        return;
                    }
                    if (next.delayMs) await new Promise(r => setTimeout(r, next.delayMs));
                    res.writeHead(next.status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(next.body));
                });
            });
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address();
                const port = typeof addr === 'object' && addr ? addr.port : 0;
                baseUrl = `http://127.0.0.1:${port}/`;
                resolve();
            });
        }),
);

afterEach(() => {
    capturedRequests = [];
    responseQueue = [];
});

afterAll(
    () =>
        new Promise<void>(resolve => {
            server.closeAllConnections();
            server.close(() => resolve());
        }),
);

// ─── fetchChanges ─────────────────────────────────────────────────────────────

describe('fetchChanges', () => {
    it('maps 1C products to ErpChangeSet with correct type and payload', async () => {
        enqueue(200, {
            value: [
                { Ref_Key: 'p-1', Description: 'Part A', Артикул: 'A-001', ПометкаУдаления: false },
            ],
        });

        const result = await makeAdapter().fetchChanges(new Date(0));

        expect(result.events).toHaveLength(1);
        expect(result.events[0]!.type).toBe('product.updated');
        expect(result.events[0]!.payload).toMatchObject({
            productId: 'p-1',
            name: 'Part A',
            enabled: true,
        });
        expect(result.cursor).toBeInstanceOf(Date);
    });

    it('maps ПометкаУдаления: true → enabled: false', async () => {
        enqueue(200, {
            value: [
                { Ref_Key: 'p-2', Description: 'Deleted', Артикул: 'D-001', ПометкаУдаления: true },
            ],
        });

        const result = await makeAdapter().fetchChanges(new Date(0));

        expect(result.events[0]!.payload).toMatchObject({ productId: 'p-2', enabled: false });
    });

    it('returns empty events for empty 1C response', async () => {
        enqueue(200, { value: [] });

        const result = await makeAdapter().fetchChanges(new Date(0));

        expect(result.events).toHaveLength(0);
    });

    it('sends $filter query parameter in the request URL', async () => {
        enqueue(200, { value: [] });
        const since = new Date('2024-01-15T10:00:00.000Z');

        await makeAdapter().fetchChanges(since);

        const req = capturedRequests[0]!;
        const url = new URL(req.url, baseUrl);
        expect(url.searchParams.get('$filter')).toContain('2024-01-15T10:00:00.000Z');
        expect(url.searchParams.get('$format')).toBe('json');
    });

    it('sends correct Basic Authorization header', async () => {
        enqueue(200, { value: [] });

        await makeAdapter().fetchChanges(new Date(0));

        const req = capturedRequests[0]!;
        const expectedCreds = Buffer.from('admin:secret').toString('base64');
        expect(req.headers['authorization']).toBe(`Basic ${expectedCreds}`);
    });

    it('throws on 401 response', async () => {
        enqueue(401, { error: 'Unauthorized' });

        await expect(makeAdapter().fetchChanges(new Date())).rejects.toThrow('1C HTTP 401');
    });

    it('throws on 500 response', async () => {
        enqueue(500, { error: 'Internal Server Error' });

        await expect(makeAdapter().fetchChanges(new Date())).rejects.toThrow('1C HTTP 500');
    });

    it('aborts request on timeout', async () => {
        enqueue(200, { value: [] }, 5_000);

        const adapter = makeAdapter({ timeoutMs: 200 });
        const err = await adapter.fetchChanges(new Date()).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(Error);
        const e = err as Error;
        expect(e.name === 'AbortError' || /abort|signal/i.test(e.message)).toBe(true);
    });
});

// ─── pushOrder ────────────────────────────────────────────────────────────────

describe('pushOrder', () => {
    it('returns erpOrderId from 1C Ref_Key', async () => {
        enqueue(200, { Ref_Key: 'erp-order-789' });

        const result = await makeAdapter().pushOrder({
            orderId: 'order-42',
            lines: [{ variantId: 'v-1', quantity: 3, unitPrice: 1500 }],
        });

        expect(result.erpOrderId).toBe('erp-order-789');
    });

    it('sends POST to Document_ЗаказКлиента endpoint', async () => {
        enqueue(200, { Ref_Key: 'erp-ref-1' });

        await makeAdapter().pushOrder({
            orderId: 'order-99',
            lines: [{ variantId: 'v-2', quantity: 1, unitPrice: 200 }],
        });

        const req = capturedRequests[0]!;
        expect(req.method).toBe('POST');
        expect(req.url).toContain(
            'Document_%D0%97%D0%B0%D0%BA%D0%B0%D0%B7%D0%9A%D0%BB%D0%B8%D0%B5%D0%BD%D1%82%D0%B0',
        );
        const body = JSON.parse(req.body) as Record<string, unknown>;
        expect(body['Номер']).toBe('order-99');
    });
});

// ─── pushInventoryDelta ───────────────────────────────────────────────────────

describe('pushInventoryDelta', () => {
    it('sends mapped 1C fields to InformationRegister endpoint', async () => {
        enqueue(200, {});

        await makeAdapter().pushInventoryDelta({
            variantId: 'variant-abc',
            branchId: 'branch-x',
            delta: -5,
        });

        const req = capturedRequests[0]!;
        expect(req.method).toBe('POST');
        const body = JSON.parse(req.body) as Record<string, unknown>;
        expect(body['Номенклатура_Key']).toBe('variant-abc');
        expect(body['Склад_Key']).toBe('branch-x');
        expect(body['КоличествоИзменение']).toBe(-5);
    });
});
