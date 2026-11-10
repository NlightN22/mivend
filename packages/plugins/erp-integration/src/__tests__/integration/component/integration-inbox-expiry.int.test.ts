import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxExpiryService } from '../../../integration-inbox-expiry.service';
import { INBOX_EXPIRY_SLICE_SIZE } from '../../../types';
import { testRequestContextService } from '../../test-request-context-service';

// Real Postgres: the id-ordered slice, the advisory try-lock and the statement timeout exist only at the DB level.
let dataSource: DataSource;
let expiry: IntegrationInboxExpiryService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox_expiry');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent],
        synchronize: true,
    });
    await dataSource.initialize();
});

beforeEach(() => {
    expiry = new IntegrationInboxExpiryService(
        createTestConnection(dataSource),
        testRequestContextService,
    );
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function insert(
    eventId: string,
    status: string,
    payload: string,
    ageDays: number,
    entityId = 'e1',
    version = '1',
): Promise<void> {
    await dataSource.query(
        `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status, created_at)
         VALUES ('price', $1, $2, $3, $4::jsonb, $5, now() - make_interval(days => $6::int))`,
        [entityId, version, eventId, payload, status, ageDays],
    );
}

async function drain(): Promise<number> {
    let deleted = 0;
    for (;;) {
        const slice = await expiry.deleteExpiredTombstones(30_000);
        deleted += slice.deleted;
        if (slice.finished) return deleted;
    }
}

async function remaining(): Promise<string[]> {
    const rows: Array<{ source_event_id: string }> = await dataSource.query(
        'SELECT source_event_id FROM integration_inbox_event ORDER BY id',
    );
    return rows.map(r => r.source_event_id);
}

describe('IntegrationInboxExpiryService (integration, real Postgres)', () => {
    it('deletes only old tombstoned processed rows and keeps the newest row, recent tombstones and other statuses', async () => {
        await insert('old-tomb', 'processed', '{}', 30);
        await insert('old-newest', 'processed', '{"real":1}', 30, 'e1', '2');
        await insert('old-failed', 'failed', '{}', 30);
        await insert('old-pending', 'pending', '{}', 30);
        await insert('recent-tomb', 'processed', '{}', 1);

        expect(await drain()).toBe(1);

        expect(await remaining()).toEqual([
            'old-newest',
            'old-failed',
            'old-pending',
            'recent-tomb',
        ]);
    });

    it('drains a backlog larger than one slice over several bounded ticks and is a no-op afterwards', async () => {
        const total = INBOX_EXPIRY_SLICE_SIZE + 700;
        await dataSource.query(
            `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status, created_at)
             SELECT 'price', 'e' || g, '1', 'evt-' || g, '{}'::jsonb, 'processed', now() - interval '30 days'
               FROM generate_series(1, $1) g`,
            [total],
        );
        await insert('keep', 'processed', '{"real":1}', 30, 'e-keep');

        const first = await expiry.deleteExpiredTombstones(30_000);
        expect(first.finished).toBe(false);
        expect(first.deleted).toBe(INBOX_EXPIRY_SLICE_SIZE);

        expect(first.deleted + (await drain())).toBe(total);
        expect(await remaining()).toEqual(['keep']);
        expect(await drain()).toBe(0);
    });

    it('skips while another sweep holds the lock and leaves rows untouched', async () => {
        await insert('old-tomb', 'processed', '{}', 30);
        const holder = dataSource.createQueryRunner();
        await holder.startTransaction();
        await holder.query(`select pg_advisory_xact_lock(hashtextextended('inbox-expiry', 0))`);
        try {
            expect(await expiry.deleteExpiredTombstones(30_000)).toEqual({
                deleted: 0,
                finished: true,
                outcome: 'skipped',
            });
        } finally {
            await holder.rollbackTransaction();
            await holder.release();
        }
        expect(await remaining()).toEqual(['old-tomb']);
    });

    it('treats a statement timeout as a skipped tick and recovers afterwards', async () => {
        await insert('old-tomb', 'processed', '{}', 30);
        const blocker = dataSource.createQueryRunner();
        await blocker.startTransaction();
        await blocker.query('LOCK TABLE integration_inbox_event IN ACCESS EXCLUSIVE MODE');
        try {
            expect(await expiry.deleteExpiredTombstones(200)).toEqual({
                deleted: 0,
                finished: true,
                outcome: 'timeout',
            });
        } finally {
            await blocker.rollbackTransaction();
            await blocker.release();
        }
        expect(await drain()).toBe(1);
    });
});
