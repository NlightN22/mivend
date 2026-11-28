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
import { drainExpiry } from './expiry-drain';
import { IntegrationInboxExpiryService } from '../../../integration-inbox-expiry.service';
import { IntegrationInboxRetentionService } from '../../../integration-inbox-retention.service';
import { INBOX_DEDUP_HORIZON_DAYS } from '../../../types';
import { testRequestContextService } from '../../test-request-context-service';

// Real Postgres: age filter, partial index and the version-aware expiry guard run only in SQL.
let dataSource: DataSource;
let retention: IntegrationInboxRetentionService;
let expiry: IntegrationInboxExpiryService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox_latest_payload');
const OLD = INBOX_DEDUP_HORIZON_DAYS + 3;

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
    await dataSource.query(
        `CREATE TABLE "order" (id serial PRIMARY KEY, "customFieldsErporderid" varchar,
            "customFieldsErpchangedversion" varchar, "customFieldsErpstateversion" varchar)`,
    );
});

beforeEach(() => {
    const connection = createTestConnection(dataSource);
    retention = new IntegrationInboxRetentionService(connection, testRequestContextService);
    expiry = new IntegrationInboxExpiryService(connection, testRequestContextService);
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
    stream: string,
    status: string,
    ageDays: number,
    version = '1',
    entityId = 'e1',
): Promise<void> {
    await dataSource.query(
        `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status, created_at)
         VALUES ($1, $2, $3, $4, '{"real":1}'::jsonb, $5, now() - make_interval(days => $6::int))`,
        [stream, entityId, version, eventId, status, ageDays],
    );
}

async function sweep(): Promise<number> {
    let total = 0;
    for (;;) {
        const slice = await retention.purgeSupersededProcessedRows();
        total += slice.tombstoned;
        if (slice.finished) return total;
    }
}

async function state(): Promise<Record<string, boolean>> {
    const rows: Array<{ source_event_id: string; full: boolean }> = await dataSource.query(
        `SELECT source_event_id, payload <> '{}'::jsonb AS "full" FROM integration_inbox_event`,
    );
    return Object.fromEntries(rows.map(r => [r.source_event_id, r.full]));
}

describe('latest-version payload retention (integration, real Postgres)', () => {
    it('empties the newest aged row of an unread stream, keeps its row and version, and is idempotent', async () => {
        await insert('price-new', 'price', 'processed', OLD, '5');

        expect(await sweep()).toBe(1);
        expect(await state()).toEqual({ 'price-new': false });
        const [row]: Array<{ version: string; status: string }> = await dataSource.query(
            'SELECT version, status FROM integration_inbox_event',
        );
        expect(row).toEqual({ version: '5', status: 'processed' });
        expect(await sweep()).toBe(0);
    });

    it('keeps the payload of streams whose latest payload is still read', async () => {
        await insert('wh', 'warehouse', 'processed', OLD);
        await insert('pos', 'point-of-sale', 'processed', OLD);
        await insert('bank', 'bank', 'processed', OLD);

        expect(await sweep()).toBe(0);
        expect(await state()).toEqual({ wh: true, pos: true, bank: true });
    });

    it('leaves young rows and every non-processed status untouched', async () => {
        await insert('young', 'price', 'processed', 1);
        await insert('p', 'price', 'pending', OLD, '1', 'e2');
        await insert('d', 'price', 'dependency_missing', OLD, '1', 'e3');
        await insert('f', 'price', 'failed', OLD, '1', 'e4');
        await insert('x', 'price', 'processing', OLD, '1', 'e5');

        expect(await sweep()).toBe(0);
        expect(Object.values(await state()).every(Boolean)).toBe(true);
    });

    it('expires older emptied duplicates but keeps the emptied newest version as the reference', async () => {
        await insert('v9', 'price', 'processed', OLD, '9');
        await insert('v10', 'price', 'processed', OLD, '10');
        await insert('v2', 'price', 'processed', OLD, '2');
        await sweep();

        expect(await drainExpiry(expiry)).toBe(2);
        expect(await state()).toEqual({ v10: false });
        expect((await expiry.deleteExpiredTombstones(30_000)).outcome).toBe('skipped');
    });

    it('keeps the emptied newest version when an older version arrived later', async () => {
        await insert('v5', 'price', 'processed', OLD, '5');
        await insert('v3-redelivered', 'price', 'processed', OLD, '3');
        await dataSource.query(`UPDATE integration_inbox_event SET payload = '{}'::jsonb`);

        await drainExpiry(expiry);

        expect(await state()).toEqual({ v5: false });
    });
});
