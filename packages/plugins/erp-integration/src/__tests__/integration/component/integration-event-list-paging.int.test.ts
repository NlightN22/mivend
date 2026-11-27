import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
    CAPPED_COUNT_CEILING,
    QueryTooLargeError,
    cappedCountQuery,
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationInboxHealthService } from '../../../integration-inbox-health.service';
import { IntegrationEventListService } from '../../../integration-event-list.service';

// 250k rows, every 12th a no-op: about 20.8k problem rows, above the 10k count ceiling.
const INBOX_ROWS = 250_000;
const NOOP_EVERY = 12;

let dataSource: DataSource;
let lists: IntegrationEventListService;
let health: IntegrationInboxHealthService;

const { schema, extra } = testSchemaOptions('erp_integration_event_list_paging');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent, IntegrationOutboxEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = createTestConnection(dataSource);
    lists = new IntegrationEventListService(connection);
    health = new IntegrationInboxHealthService(connection);

    await dataSource.query(
        `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status, outcome, created_at, updated_at, processed_at)
         SELECT 's' || (g % 20), 'e' || g, '1', 'src' || g, '{}'::jsonb,
                CASE WHEN g % 1000 = 1 THEN 'dependency_missing' WHEN g % 5000 = 2 THEN 'failed'
                     WHEN g % 100 = 0 THEN 'pending' ELSE 'processed' END,
                CASE WHEN g % ${NOOP_EVERY} = 3 THEN 'noop' ELSE 'applied' END,
                now() - (g || ' seconds')::interval, now() - (g || ' seconds')::interval, now()
         FROM generate_series(1, ${INBOX_ROWS}) g`,
    );
    await dataSource.query('VACUUM ANALYZE integration_inbox_event');
}, 120_000);

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function explain(qb: SelectQueryBuilder<ObjectLiteral>, seqScanOff = false): Promise<string> {
    const [sql, params] = qb.getQueryAndParameters();
    const runner = dataSource.createQueryRunner();
    try {
        if (seqScanOff) await runner.query('SET enable_seqscan = off');
        const [row] = await runner.query(`EXPLAIN (FORMAT JSON) ${sql}`, params);
        return JSON.stringify(row['QUERY PLAN']);
    } finally {
        if (seqScanOff) await runner.query('RESET enable_seqscan');
        await runner.release();
    }
}

describe('exchange health list paging on a large inbox', () => {
    it('keeps the problem page and its counts off a sequential scan of the inbox', async () => {
        const page = lists.inboxIssuesQuery(testRequestContext).take(20).skip(0);
        expect(await explain(page)).not.toContain('"Seq Scan"');
        expect(await explain(cappedCountQuery(page), true)).not.toContain('"Seq Scan"');

        const failed = lists.inboxIssuesQuery(testRequestContext, {
            filter: { status: { eq: 'failed' } },
        });
        expect(await explain(failed.clone().take(20))).not.toContain('"Seq Scan"');
    });

    it('keeps the stream backlog summary on the unprocessed-rows index', async () => {
        const plan = await dataSource.query(
            `EXPLAIN (FORMAT JSON) SELECT stream, status, COUNT(*), MIN(created_at) FROM integration_inbox_event
             WHERE status IN ('pending', 'processing', 'failed', 'dependency_missing', 'replay_requested')
             GROUP BY stream, status`,
        );
        expect(JSON.stringify(plan)).toContain('integration_inbox_event_backlog');
        expect(await health.getBacklogByStream(testRequestContext)).not.toHaveLength(0);
    });

    it('caps the total with an explicit marker and still pages through the ceiling', async () => {
        const first = await lists.listInboxIssues(testRequestContext, { take: 100 });
        expect(first.totalItems).toBe(CAPPED_COUNT_CEILING);
        expect(first.totalItemsCapped).toBe(true);
        expect(first.items).toHaveLength(100);

        const second = await lists.listInboxIssues(testRequestContext, { skip: 100, take: 100 });
        const ids = new Set(first.items.map(i => i.id));
        expect(second.items.every(i => !ids.has(i.id))).toBe(true);
        expect(second.items[0].updatedAt.getTime()).toBeLessThanOrEqual(
            first.items[99].updatedAt.getTime(),
        );

        const last = await lists.listInboxIssues(testRequestContext, {
            skip: CAPPED_COUNT_CEILING - 50,
            take: 100,
        });
        expect(last.items).toHaveLength(100);
        expect(last.totalItemsCapped).toBe(true);
    });

    it('fails explicitly instead of paging past the ceiling', async () => {
        await expect(
            lists.listInboxIssues(testRequestContext, { skip: CAPPED_COUNT_CEILING + 1, take: 20 }),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('reports an exact total and pages 1, 2 and last when the set is under the ceiling', async () => {
        const options = { filter: { status: { eq: 'dependency_missing' } }, take: 100 };
        const p1 = await lists.listInboxIssues(testRequestContext, { ...options, skip: 0 });
        const p2 = await lists.listInboxIssues(testRequestContext, { ...options, skip: 100 });
        const p3 = await lists.listInboxIssues(testRequestContext, { ...options, skip: 200 });
        expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([100, 100, 50]);
        expect([p1, p2, p3].every(p => p.totalItems === 250 && !p.totalItemsCapped)).toBe(true);
        const all = [...p1.items, ...p2.items, ...p3.items].map(i => i.id);
        expect(new Set(all).size).toBe(250);
    });
});

describe('outbox problem list paging', () => {
    it('reports an exact total and pages 1, 2 and last', async () => {
        await dataSource.query(
            `INSERT INTO integration_outbox (event_id, event_type, payload, status, created_at)
             SELECT gen_random_uuid(), 'order.confirmed', '{}'::jsonb,
                    CASE WHEN g % 5 = 0 THEN 'skipped' WHEN g % 5 = 1 THEN 'failed' ELSE 'published' END,
                    now() - (g || ' seconds')::interval
             FROM generate_series(1, 5000) g`,
        );
        const options = { take: 100 };
        const p1 = await lists.listOutboxProblems(testRequestContext, { ...options, skip: 0 });
        const p2 = await lists.listOutboxProblems(testRequestContext, { ...options, skip: 100 });
        const p3 = await lists.listOutboxProblems(testRequestContext, { ...options, skip: 1900 });
        expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([100, 100, 100]);
        expect(p1.totalItems).toBe(2000);
        expect(p1.totalItemsCapped).toBe(false);
        const beyond = await lists.listOutboxProblems(testRequestContext, {
            take: 100,
            skip: 2000,
        });
        expect(beyond.items).toHaveLength(0);

        const plan = await explain(lists.outboxProblemsQuery(testRequestContext).take(20), true);
        expect(plan).not.toContain('"Seq Scan"');
    });
});
