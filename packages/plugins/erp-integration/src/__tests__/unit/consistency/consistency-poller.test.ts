import { describe, expect, it, vi } from 'vitest';
import type { RequestContextService } from '@vendure/core';

import { ConsistencyClientError } from '../../../consistency/consistency-client-error';
import { parseSummary } from '../../../consistency/consistency-parse';
import { ConsistencyPollerService } from '../../../consistency/consistency-poller.service';
import type {
    ConsistencyReportStore,
    StoredSourceState,
} from '../../../consistency/consistency-report.store';
import type { ConsistencySourceClient } from '../../../consistency/consistency-source.client';
import type { ConsistencyIssuePage } from '../../../consistency/consistency-types';
import type { ErpIntegrationPluginOptions } from '../../../types';
import { CONFIG, issue, wireSummary } from './consistency-fixtures';

function setup(opts: {
    state?: StoredSourceState | null;
    summary?: () => Promise<ReturnType<typeof parseSummary>>;
    pages?: Array<ConsistencyIssuePage | ConsistencyClientError>;
    sources?: ErpIntegrationPluginOptions['consistencySources'];
}) {
    const store = {
        getState: vi.fn(async () => opts.state ?? null),
        upsertIssues: vi.fn(async () => undefined),
        writeState: vi.fn(async () => undefined),
        markUnavailable: vi.fn(async () => undefined),
        resolveUnavailable: vi.fn(async () => undefined),
    };
    const queue = [...(opts.pages ?? [])];
    const client = {
        getSummary:
            opts.summary ?? (async () => parseSummary(wireSummary({ lastCheck: freshCheck() }))),
        getIssuesPage: vi.fn(async (_request: unknown) => {
            const next = queue.shift();
            if (!next) throw new Error('no more pages scripted');
            if (next instanceof ConsistencyClientError) throw next;
            return next;
        }),
    };
    const poller = new ConsistencyPollerService(
        { consistencySources: opts.sources } as ErpIntegrationPluginOptions,
        { create: async () => ({}) } as unknown as RequestContextService,
        store as unknown as ConsistencyReportStore,
    );
    return {
        poller,
        store,
        client: client as unknown as ConsistencySourceClient,
        rawClient: client,
    };
}

function freshCheck(): Record<string, unknown> {
    const now = new Date().toISOString();
    return {
        startedAt: now,
        finishedAt: now,
        status: 'ok',
        durationMs: 1,
        mode: 'incremental',
        checkedEntities: 1,
    };
}

describe('ConsistencyPollerService', () => {
    it('does nothing and makes no call without configured sources', async () => {
        const { poller } = setup({});
        expect(await poller.pollAll()).toEqual([]);
    });

    it('follows cursors until null, stores every page, resolves a prior unavailable issue', async () => {
        const { poller, store, client, rawClient } = setup({
            pages: [
                { items: [issue('a', '2026-10-30T10:00:00.000Z')], nextCursor: 'c1' },
                { items: [issue('b', '2026-10-30T12:00:00.000Z')], nextCursor: null },
            ],
        });
        const result = await poller.pollSource(CONFIG, client);

        expect(result).toMatchObject({ health: 'ok', stored: 2 });
        expect(store.upsertIssues).toHaveBeenCalledTimes(2);
        expect(rawClient.getIssuesPage.mock.calls.map(c => (c as unknown[])[0])).toEqual([
            { since: null, cursor: null },
            { since: null, cursor: 'c1' },
        ]);
        expect(store.writeState).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ watermark: '2026-10-30T12:00:00.000Z', succeeded: true }),
        );
        expect(store.resolveUnavailable).toHaveBeenCalledOnce();
        expect(store.markUnavailable).not.toHaveBeenCalled();
    });

    it('sends the stored watermark as since', async () => {
        const watermark = new Date('2026-10-30T09:00:00.000Z');
        const { poller, client, rawClient } = setup({
            state: { health: 'ok', lastFinishedAt: null, watermark },
            pages: [{ items: [], nextCursor: null }],
        });
        await poller.pollSource(CONFIG, client);
        expect(rawClient.getIssuesPage.mock.calls[0][0]).toEqual({
            since: watermark.toISOString(),
            cursor: null,
        });
    });

    it('ends a looping cursor with invalid-response and keeps the old watermark', async () => {
        const loop: ConsistencyIssuePage = {
            items: [issue('a', '2026-10-30T10:00:00.000Z')],
            nextCursor: 'same',
        };
        const { poller, store, client } = setup({ pages: [loop, loop, loop] });
        const result = await poller.pollSource(CONFIG, client);

        expect(result.health).toBe('invalid-response');
        expect(store.writeState).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ watermark: null, succeeded: false }),
        );
        expect(store.markUnavailable).toHaveBeenCalledOnce();
    });

    it.each([
        ['unreachable', 'unreachable'],
        ['unauthorized', 'unauthorized'],
        ['forbidden', 'unauthorized'],
        ['no-check-yet', 'no-check-yet'],
    ] as const)(
        'summary failure %s raises report-unavailable (%s) and fetches no issues',
        async (kind, health) => {
            const { poller, store, client, rawClient } = setup({
                summary: async () => {
                    throw new ConsistencyClientError(kind, 'x');
                },
            });
            const result = await poller.pollSource(CONFIG, client);

            expect(result.health).toBe(health);
            expect(rawClient.getIssuesPage).not.toHaveBeenCalled();
            expect(store.markUnavailable).toHaveBeenCalledWith(
                {},
                'search-service',
                health,
                expect.any(String),
            );
            expect(store.resolveUnavailable).not.toHaveBeenCalled();
        },
    );

    it('rate limiting is recorded but is not an unavailable issue', async () => {
        const { poller, store, client } = setup({
            pages: [new ConsistencyClientError('rate-limited', 'x', 30)],
        });
        const result = await poller.pollSource(CONFIG, client);
        expect(result.health).toBe('rate-limited');
        expect(store.markUnavailable).not.toHaveBeenCalled();
        expect(store.resolveUnavailable).not.toHaveBeenCalled();
    });

    it('a stale check still collects issues and reports unavailable', async () => {
        const old = '2026-10-01T00:00:00.000Z';
        const { poller, store, client } = setup({
            summary: async () =>
                parseSummary(
                    wireSummary({
                        lastCheck: { ...freshCheck(), startedAt: old, finishedAt: old },
                    }),
                ),
            pages: [{ items: [issue('a', '2026-10-30T10:00:00.000Z')], nextCursor: null }],
        });
        const result = await poller.pollSource(CONFIG, client);
        expect(result).toMatchObject({ health: 'stale', stored: 1 });
        expect(store.markUnavailable).toHaveBeenCalledOnce();
    });

    it('does not swallow a non-provider error', async () => {
        const { poller, client } = setup({
            summary: async () => {
                throw new TypeError('boom');
            },
        });
        await expect(poller.pollSource(CONFIG, client)).rejects.toThrow('boom');
    });
});
