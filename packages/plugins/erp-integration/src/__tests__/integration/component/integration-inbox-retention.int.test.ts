import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxRetentionService } from '../../../integration-inbox-retention.service';
import {
    RETENTION_SLICE_SIZE,
    RETENTION_SLICE_SQL,
} from '../../../integration-inbox-retention-slice';
import { testRequestContextService } from '../../test-request-context-service';

// Real Postgres: the statement timeout, advisory try-lock and index range scan exist only at the DB level.
let dataSource: DataSource;
let retention: IntegrationInboxRetentionService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox_retention');
const SINGLES = 1500;
const TRIPLES = 300;

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
    retention = new IntegrationInboxRetentionService(
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

async function seed(): Promise<void> {
    await dataSource.query(
        `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status)
         SELECT 'price', 'e' || lpad(g::text, 6, '0'), v::text, 'evt-' || g || '-' || v, '{"real":1}'::jsonb, 'processed'
           FROM generate_series(1, $1) g, generate_series(1, CASE WHEN g <= $2 THEN 3 ELSE 1 END) v`,
        [SINGLES + TRIPLES, TRIPLES],
    );
}

async function drain(): Promise<{ ticks: number; tombstoned: number }> {
    let ticks = 0;
    let tombstoned = 0;
    for (;;) {
        const slice = await retention.purgeSupersededProcessedRows();
        ticks += 1;
        tombstoned += slice.tombstoned;
        if (slice.finished) return { ticks, tombstoned };
    }
}

async function expectedSupersededIds(): Promise<string[]> {
    const rows: Array<{ id: string }> = await dataSource.query(
        `SELECT e.id FROM integration_inbox_event e
          WHERE e.version::int < (SELECT MAX(x.version::int) FROM integration_inbox_event x
                                   WHERE x.stream = e.stream AND x.entity_id = e.entity_id)
          ORDER BY e.id`,
    );
    return rows.map(r => r.id);
}

async function tombstonedIds(): Promise<string[]> {
    const rows: Array<{ id: string }> = await dataSource.query(
        `SELECT id FROM integration_inbox_event WHERE payload = '{}'::jsonb ORDER BY id`,
    );
    return rows.map(r => r.id);
}

describe('IntegrationInboxRetentionService sweep (integration, real Postgres)', () => {
    it('drains a backlog larger than one slice over several bounded ticks, matching the full-scan result', async () => {
        await seed();
        const expected = await expectedSupersededIds();

        const first = await retention.purgeSupersededProcessedRows();
        expect(first.finished).toBe(false);
        expect(first.tombstoned).toBeLessThan(expected.length);

        const rest = await drain();

        expect(rest.ticks).toBeGreaterThanOrEqual(1);
        expect(first.tombstoned + rest.tombstoned).toBe(TRIPLES * 2);
        expect(await tombstonedIds()).toEqual(expected);
        const newest: Array<{ n: string }> = await dataSource.query(
            `SELECT count(*) AS n FROM integration_inbox_event WHERE payload <> '{}'::jsonb`,
        );
        expect(Number(newest[0].n)).toBe(SINGLES + TRIPLES);
    });

    it('does nothing on a second full pass', async () => {
        await seed();
        await drain();

        const again = await drain();

        expect(again.tombstoned).toBe(0);
    });

    it('plans the slice as a bounded index range scan, not a full-index scan', async () => {
        await seed();
        await dataSource.query('ANALYZE integration_inbox_event');
        const runner = dataSource.createQueryRunner();
        try {
            await runner.query('SET enable_seqscan = off');
            const [{ 'QUERY PLAN': plan }] = await runner.query(
                `EXPLAIN (ANALYZE, FORMAT JSON) ${RETENTION_SLICE_SQL}`,
                ['price', 'e000100', RETENTION_SLICE_SIZE],
            );
            const text = JSON.stringify(plan);
            expect(text).not.toContain('Seq Scan');
            expect(text).toContain('integration_inbox_event_retention');
            const scan = JSON.stringify(plan).match(/"Actual Rows":(\d+)/g) ?? [];
            for (const m of scan) {
                expect(Number(m.split(':')[1])).toBeLessThanOrEqual(RETENTION_SLICE_SIZE);
            }
        } finally {
            await runner.release();
        }
    });

    it('treats a statement timeout as a skipped tick, not an error, and recovers afterwards', async () => {
        await seed();
        const blocker = dataSource.createQueryRunner();
        await blocker.startTransaction();
        await blocker.query('LOCK TABLE integration_inbox_event IN ACCESS EXCLUSIVE MODE');
        try {
            const result = await retention.purgeSupersededProcessedRows(200);
            expect(result).toEqual({ tombstoned: 0, finished: true, outcome: 'timeout' });
        } finally {
            await blocker.rollbackTransaction();
            await blocker.release();
        }

        const recovered = await drain();
        expect(recovered.tombstoned).toBe(TRIPLES * 2);
    });

    it('skips while another sweep holds the retention lock and leaves rows untouched', async () => {
        await seed();
        const holder = dataSource.createQueryRunner();
        await holder.startTransaction();
        await holder.query(`select pg_advisory_xact_lock(hashtextextended('inbox-retention', 0))`);
        try {
            const result = await retention.purgeSupersededProcessedRows();
            expect(result).toEqual({ tombstoned: 0, finished: true, outcome: 'skipped' });
        } finally {
            await holder.rollbackTransaction();
            await holder.release();
        }
        expect(await tombstonedIds()).toEqual([]);
    });

    it('never touches pending rows or the newest version across a slice boundary', async () => {
        await seed();
        await dataSource.query(
            `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status)
             VALUES ('price', 'e000001', '9', 'evt-pending', '{"real":1}'::jsonb, 'pending')`,
        );

        await drain();

        const pending: Array<{ payload: unknown }> = await dataSource.query(
            `SELECT payload FROM integration_inbox_event WHERE status = 'pending'`,
        );
        expect(pending[0].payload).toEqual({ real: 1 });
        const newest: Array<{ n: string }> = await dataSource.query(
            `SELECT count(*) AS n FROM integration_inbox_event
              WHERE entity_id = 'e000001' AND status = 'processed' AND payload <> '{}'::jsonb`,
        );
        expect(Number(newest[0].n)).toBe(1);
    });
});
