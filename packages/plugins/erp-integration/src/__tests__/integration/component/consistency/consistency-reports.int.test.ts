import type { RequestContextService } from '@vendure/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { ConsistencyClientError } from '../../../../consistency/consistency-client-error';
import { ConsistencyPollerService } from '../../../../consistency/consistency-poller.service';
import { ConsistencyReport } from '../../../../consistency/consistency-report.entity';
import { ConsistencyReportService } from '../../../../consistency/consistency-report.service';
import { ConsistencyReportStore } from '../../../../consistency/consistency-report.store';
import { ConsistencySourceState } from '../../../../consistency/consistency-source-state.entity';
import type { ConsistencySourceClient } from '../../../../consistency/consistency-source.client';
import type { ErpIntegrationPluginOptions } from '../../../../types';
import {
    CONFIG,
    freshSummary,
    issue,
    scriptedClient,
} from '../../../unit/consistency/consistency-fixtures';

const { schema, extra } = testSchemaOptions('erp_integration_consistency');
const ctx = testRequestContext;

let dataSource: DataSource;
let store: ConsistencyReportStore;
let service: ConsistencyReportService;
let poller: ConsistencyPollerService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [ConsistencyReport, ConsistencySourceState],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = createTestConnection(dataSource);
    store = new ConsistencyReportStore(connection);
    service = new ConsistencyReportService(connection);
    poller = new ConsistencyPollerService(
        {} as ErpIntegrationPluginOptions,
        { create: async () => ctx } as unknown as RequestContextService,
        store,
    );
});

afterEach(async () => {
    await dataSource.query(
        'TRUNCATE consistency_report, consistency_source_state RESTART IDENTITY',
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const rows = (): Promise<ConsistencyReport[]> =>
    dataSource.getRepository(ConsistencyReport).find({ order: { id: 'ASC' } });

describe('upsert', () => {
    it('is idempotent: the same page twice keeps one row with the same uuid and number', async () => {
        const page = [
            issue('a', '2026-10-30T10:00:00.000Z'),
            issue('b', '2026-10-30T11:00:00.000Z'),
        ];
        await store.upsertIssues(ctx, 'search-service', page);
        const first = await rows();
        await store.upsertIssues(ctx, 'search-service', page);
        const second = await rows();

        expect(second).toHaveLength(2);
        expect(second.map(r => [r.uuid, r.number])).toEqual(first.map(r => [r.uuid, r.number]));
        expect(new Set(second.map(r => r.number)).size).toBe(2);
        expect(second[0].uuid).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('keeps one row when the same id is in a page twice', async () => {
        await store.upsertIssues(ctx, 'search-service', [
            issue('a', '2026-10-30T10:00:00.000Z', { occurrences: 1 }),
            issue('a', '2026-10-30T12:00:00.000Z', { occurrences: 2 }),
        ]);
        const all = await rows();
        expect(all).toHaveLength(1);
        expect(all[0].occurrences).toBe(2);
    });

    it('reopens a resolved id in place and keeps it in history while resolved', async () => {
        await store.upsertIssues(ctx, 'search-service', [issue('a', '2026-10-30T10:00:00.000Z')]);
        await store.upsertIssues(ctx, 'search-service', [
            issue('a', '2026-10-30T11:00:00.000Z', {
                status: 'resolved',
                resolvedAt: '2026-10-30T11:00:00.000Z',
            }),
        ]);
        const [resolved] = await rows();
        expect(resolved).toMatchObject({ status: 'resolved' });
        expect(resolved.resolvedAt).toEqual(new Date('2026-10-30T11:00:00.000Z'));

        await store.upsertIssues(ctx, 'search-service', [
            issue('a', '2026-10-30T13:00:00.000Z', { occurrences: 2 }),
        ]);
        const [reopened] = await rows();
        expect(await rows()).toHaveLength(1);
        expect(reopened).toMatchObject({ status: 'open', resolvedAt: null, occurrences: 2 });
        expect([reopened.uuid, reopened.number]).toEqual([resolved.uuid, resolved.number]);
    });

    it('a late page with older data does not overwrite newer data', async () => {
        await store.upsertIssues(ctx, 'search-service', [
            issue('a', '2026-10-30T12:00:00.000Z', {
                status: 'resolved',
                resolvedAt: '2026-10-30T12:00:00.000Z',
            }),
        ]);
        await store.upsertIssues(ctx, 'search-service', [issue('a', '2026-10-30T10:00:00.000Z')]);
        expect((await rows())[0].status).toBe('resolved');
    });

    it('concurrent writers of the same page leave one row per id', async () => {
        const page = [
            issue('a', '2026-10-30T10:00:00.000Z'),
            issue('b', '2026-10-30T10:00:00.000Z'),
        ];
        await Promise.all(
            Array.from({ length: 5 }, () => store.upsertIssues(ctx, 'search-service', page)),
        );
        expect(await rows()).toHaveLength(2);
    });
});

describe('poller paging with concurrent updates', () => {
    it('sees an issue updated between pages twice but stores it once, with the latest data', async () => {
        const client = scriptedClient([
            {
                items: [
                    issue('a', '2026-10-30T10:00:00.000Z'),
                    issue('b', '2026-10-30T10:05:00.000Z'),
                ],
                nextCursor: 'c1',
            },
            {
                items: [
                    issue('c', '2026-10-30T10:10:00.000Z'),
                    issue('a', '2026-10-30T10:20:00.000Z', { occurrences: 2 }),
                ],
                nextCursor: null,
            },
        ]);
        await poller.pollSource(CONFIG, client);

        const all = await rows();
        expect(all.map(r => r.providerIssueId).sort()).toEqual(['a', 'b', 'c']);
        expect(all.find(r => r.providerIssueId === 'a')?.occurrences).toBe(2);
        const [state] = await dataSource.getRepository(ConsistencySourceState).find();
        expect(state.watermark).toEqual(new Date('2026-10-30T10:20:00.000Z'));
        expect(state.health).toBe('ok');
    });

    it('a failure mid-loop keeps stored pages, keeps the old watermark and reports unavailable', async () => {
        const client = scriptedClient([
            { items: [issue('a', '2026-10-30T10:00:00.000Z')], nextCursor: 'c1' },
            new ConsistencyClientError('unreachable', 'down'),
        ]);
        await poller.pollSource(CONFIG, client);

        const all = await rows();
        expect(all.map(r => r.type).sort()).toEqual(['report-unavailable', 'stock-mismatch']);
        const [state] = await dataSource.getRepository(ConsistencySourceState).find();
        expect(state.watermark).toBeNull();
        expect(state.health).toBe('unreachable');
    });
});

describe('report-unavailable lifecycle', () => {
    const failingSummary = (
        kind: 'unreachable' | 'unauthorized' | 'no-check-yet',
    ): ConsistencySourceClient =>
        ({
            getSummary: async () => {
                throw new ConsistencyClientError(kind, 'x');
            },
        }) as unknown as ConsistencySourceClient;

    it('opens one issue, reuses it while down, resolves on recovery and reopens with occurrences + 1', async () => {
        await poller.pollSource(CONFIG, failingSummary('unreachable'));
        await poller.pollSource(CONFIG, failingSummary('unauthorized'));
        const open = (await rows()).filter(r => r.type === 'report-unavailable');
        expect(open).toHaveLength(1);
        expect(open[0]).toMatchObject({ status: 'open', occurrences: 1, severity: 'critical' });

        await poller.pollSource(CONFIG, scriptedClient([{ items: [], nextCursor: null }]));
        expect((await rows())[0]).toMatchObject({ status: 'resolved' });

        await poller.pollSource(CONFIG, failingSummary('no-check-yet'));
        const [again] = await rows();
        expect(again).toMatchObject({
            status: 'open',
            occurrences: 2,
            severity: 'warning',
            resolvedAt: null,
        });
        expect(again.uuid).toBe(open[0].uuid);
    });
});

describe('retention', () => {
    it('deletes only resolved reports older than the period', async () => {
        const old = '2026-01-01T00:00:00.000Z';
        await store.upsertIssues(ctx, 'search-service', [
            issue('old-resolved', old, { status: 'resolved', resolvedAt: old }),
            issue('old-open', old),
            issue('recent-resolved', new Date().toISOString(), {
                status: 'resolved',
                resolvedAt: new Date().toISOString(),
            }),
        ]);
        expect(await store.deleteResolvedOlderThan(ctx, 90)).toBe(1);
        expect((await rows()).map(r => r.providerIssueId).sort()).toEqual([
            'old-open',
            'recent-resolved',
        ]);
    });
});

describe('read queries', () => {
    it('filters by status, type, severity and entity type, caps take, and counts open per source', async () => {
        await store.upsertIssues(ctx, 'search-service', [
            issue('a', '2026-10-30T10:00:00.000Z', { severity: 'critical' }),
            issue('b', '2026-10-30T11:00:00.000Z', { type: 'input-anomaly', entityType: 'offer' }),
            issue('c', '2026-10-30T12:00:00.000Z', {
                status: 'resolved',
                resolvedAt: '2026-10-30T12:00:00.000Z',
            }),
        ]);
        await store.upsertIssues(ctx, 'other-source', [issue('x', '2026-10-30T09:00:00.000Z')]);

        const open = await service.list(ctx, { status: 'open', source: 'search-service' });
        expect(open.items.map(r => r.providerIssueId)).toEqual(['b', 'a']);
        expect((await service.list(ctx, { severity: 'critical' })).totalItems).toBe(1);
        expect((await service.list(ctx, { type: 'input-anomaly' })).items[0].providerIssueId).toBe(
            'b',
        );
        expect((await service.list(ctx, { entityType: 'offer' })).totalItems).toBe(1);
        expect(
            (await service.list(ctx, { status: 'resolved' })).items.map(r => r.providerIssueId),
        ).toEqual(['c']);
        expect((await service.list(ctx, { take: 10_000 })).items).toHaveLength(4);

        await store.writeState(ctx, {
            source: 'search-service',
            health: 'ok',
            detail: '',
            summary: freshSummary(),
            lastFinishedAt: null,
            watermark: null,
            succeeded: true,
        });
        const [view] = await service.sources(ctx);
        expect(view.localOpenByType).toEqual({ 'stock-mismatch': 1, 'input-anomaly': 1 });
        expect(view.localOpenBySeverity).toEqual({ critical: 1, warning: 1 });
    });
});
