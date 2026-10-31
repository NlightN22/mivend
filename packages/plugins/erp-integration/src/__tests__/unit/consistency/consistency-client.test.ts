import { describe, expect, it, vi } from 'vitest';

import { ConsistencyClientError } from '../../../consistency/consistency-client-error';
import { ConsistencySourceClient } from '../../../consistency/consistency-source.client';
import { CONFIG, wireIssue, wireSummary } from './consistency-fixtures';

const ISSUE_TYPES = [
    'stock-mismatch',
    'availability-mismatch',
    'missing-in-index',
    'stale-in-index',
    'version-lag',
    'price-mismatch',
    'stream-stalled',
    'input-anomaly',
];

function respond(
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
): typeof fetch {
    return vi.fn(
        async () => new Response(JSON.stringify(body), { status, headers }),
    ) as unknown as typeof fetch;
}

async function failureOf(promise: Promise<unknown>): Promise<ConsistencyClientError> {
    try {
        await promise;
    } catch (err) {
        if (err instanceof ConsistencyClientError) return err;
    }
    throw new Error('expected a ConsistencyClientError');
}

describe('ConsistencySourceClient requests', () => {
    it('sends the key header, status=all, limit, since and cursor, and trims the base url', async () => {
        const fetchImpl = respond(200, { items: [], nextCursor: null });
        await new ConsistencySourceClient(CONFIG, fetchImpl).getIssuesPage({
            since: '2026-10-30T00:00:00.000Z',
            cursor: 'c1',
        });

        const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
        const parsed = new URL(String(url));
        expect(parsed.origin + parsed.pathname).toBe(
            'https://provider.example.invalid/v1/consistency/issues',
        );
        expect(Object.fromEntries(parsed.searchParams)).toEqual({
            status: 'all',
            limit: '500',
            since: '2026-10-30T00:00:00.000Z',
            cursor: 'c1',
        });
        expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('synthetic-key');
    });

    it('omits since and cursor on the first page', async () => {
        const fetchImpl = respond(200, { items: [], nextCursor: null });
        await new ConsistencySourceClient(CONFIG, fetchImpl).getIssuesPage({
            since: null,
            cursor: null,
        });
        const parsed = new URL(String(vi.mocked(fetchImpl).mock.calls[0][0]));
        expect([...parsed.searchParams.keys()].sort()).toEqual(['limit', 'status']);
    });
});

describe('ConsistencySourceClient error mapping', () => {
    it.each([
        [401, 'unauthorized'],
        [403, 'forbidden'],
        [400, 'bad-request'],
        [500, 'server-error'],
        [502, 'server-error'],
    ])('HTTP %i -> %s', async (status, kind) => {
        const err = await failureOf(
            new ConsistencySourceClient(CONFIG, respond(status, {})).getSummary(),
        );
        expect(err.kind).toBe(kind);
    });

    it('429 carries Retry-After', async () => {
        const err = await failureOf(
            new ConsistencySourceClient(
                CONFIG,
                respond(429, {}, { 'Retry-After': '42' }),
            ).getSummary(),
        );
        expect(err).toMatchObject({ kind: 'rate-limited', retryAfterSeconds: 42 });
    });

    it('503 no-check-yet is distinct from a plain 503', async () => {
        const noCheck = await failureOf(
            new ConsistencySourceClient(
                CONFIG,
                respond(503, { error: 'no-check-yet' }),
            ).getSummary(),
        );
        const plain = await failureOf(
            new ConsistencySourceClient(CONFIG, respond(503, { error: 'x' })).getSummary(),
        );
        expect(noCheck.kind).toBe('no-check-yet');
        expect(plain.kind).toBe('server-error');
    });

    it('a network failure is unreachable', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('ECONNREFUSED');
        }) as unknown as typeof fetch;
        expect(
            (await failureOf(new ConsistencySourceClient(CONFIG, fetchImpl).getSummary())).kind,
        ).toBe('unreachable');
    });

    it('a non-JSON 200 is malformed', async () => {
        const fetchImpl = vi.fn(
            async () => new Response('<html>', { status: 200 }),
        ) as unknown as typeof fetch;
        expect(
            (await failureOf(new ConsistencySourceClient(CONFIG, fetchImpl).getSummary())).kind,
        ).toBe('malformed');
    });
});

describe('ConsistencySourceClient response mapping', () => {
    it.each(ISSUE_TYPES)('maps an issue of type %s', async type => {
        const page = { items: [wireIssue({ type })], nextCursor: 'next' };
        const result = await new ConsistencySourceClient(CONFIG, respond(200, page)).getIssuesPage({
            since: null,
            cursor: null,
        });
        expect(result.nextCursor).toBe('next');
        expect(result.items[0]).toMatchObject({
            providerIssueId: '11111111-1111-4111-8111-111111111111',
            type,
            scope: { warehouseId: 'warehouse-a' },
            expected: { quantity: 5, availableQuantity: 5, available: true },
        });
    });

    it('maps coveredEntityTypes and ignoredEntityTypes', async () => {
        const body = wireSummary({
            coveredEntityTypes: ['stock', 'price'],
            ignoredEntityTypes: [{ entityType: 'category', reason: 'no content check' }],
        });
        const summary = await new ConsistencySourceClient(CONFIG, respond(200, body)).getSummary();
        expect(summary.coveredEntityTypes).toEqual(['stock', 'price']);
        expect(summary.ignoredEntityTypes).toEqual([
            { entityType: 'category', reason: 'no content check' },
        ]);
    });

    it('stores empty lists when an older provider omits them', async () => {
        const summary = await new ConsistencySourceClient(
            CONFIG,
            respond(200, wireSummary()),
        ).getSummary();
        expect(summary.coveredEntityTypes).toEqual([]);
        expect(summary.ignoredEntityTypes).toEqual([]);
    });

    it('rejects malformed ignoredEntityTypes', async () => {
        const body = wireSummary({ ignoredEntityTypes: [{ entityType: 'x' }] });
        await expect(
            new ConsistencySourceClient(CONFIG, respond(200, body)).getSummary(),
        ).rejects.toMatchObject({ kind: 'malformed' });
    });

    it('accepts a running check with null finishedAt and durationMs', async () => {
        const body = wireSummary({
            lastCheck: {
                startedAt: '2026-10-30T11:50:00.000Z',
                finishedAt: null,
                status: 'running',
                durationMs: null,
                mode: 'full',
                checkedEntities: 0,
            },
        });
        const summary = await new ConsistencySourceClient(CONFIG, respond(200, body)).getSummary();
        expect(summary.lastCheck).toMatchObject({
            status: 'running',
            finishedAt: null,
            durationMs: null,
        });
    });

    it.each([
        [
            'issue with an unknown status',
            { items: [wireIssue({ status: 'weird' })], nextCursor: null },
        ],
        ['issue without an id', { items: [wireIssue({ id: undefined })], nextCursor: null }],
        ['page without items', { nextCursor: null }],
        ['page with a non-string cursor', { items: [], nextCursor: 5 }],
    ])('rejects a malformed page: %s', async (_name, body) => {
        const err = await failureOf(
            new ConsistencySourceClient(CONFIG, respond(200, body)).getIssuesPage({
                since: null,
                cursor: null,
            }),
        );
        expect(err.kind).toBe('malformed');
    });

    it('rejects a summary without lastCheck', async () => {
        const err = await failureOf(
            new ConsistencySourceClient(
                CONFIG,
                respond(200, wireSummary({ lastCheck: null })),
            ).getSummary(),
        );
        expect(err.kind).toBe('malformed');
    });
});

describe('ConsistencySourceClient bounds', () => {
    it('caps details, jsonb fields and error messages', async () => {
        const big = 'x'.repeat(20_000);
        const page = {
            items: [wireIssue({ details: big, expected: { v: big }, actual: big })],
            nextCursor: null,
        };
        const { items } = await new ConsistencySourceClient(
            CONFIG,
            respond(200, page),
        ).getIssuesPage({
            since: null,
            cursor: null,
        });
        expect(items[0].details.length).toBeLessThan(4200);
        expect(items[0].details.endsWith('[truncated]')).toBe(true);
        expect(JSON.stringify(items[0].expected).length).toBeLessThan(16500);
        expect(items[0].expected).toHaveProperty('truncated');
        expect(items[0].actual).toHaveProperty('truncated');
        expect(new ConsistencyClientError('unreachable', big).message.length).toBeLessThan(4200);
    });

    it('a body that never arrives is aborted by the timeout', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => ({
            ok: true,
            status: 200,
            json: () =>
                new Promise((_resolve, reject) =>
                    init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
                ),
        })) as unknown as typeof fetch;
        const pending = failureOf(new ConsistencySourceClient(CONFIG, fetchImpl).getSummary());
        await vi.advanceTimersByTimeAsync(10_001);
        vi.useRealTimers();
        expect((await pending).kind).toBe('malformed');
    });
});
