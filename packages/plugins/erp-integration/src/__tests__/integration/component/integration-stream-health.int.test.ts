import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import type { KafkaConsumerLagEntry } from '../../../entities/kafka-consumer-lag.entity';
import { IntegrationInboxHealthService } from '../../../integration-inbox-health.service';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { VariantUnitHealthService } from '../../../variant-unit-health.service';
import { IntegrationOutboxHealthService } from '../../../integration-outbox-health.service';
import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import type { ContractVersionClient } from '../../../contract-version.client';
import { IntegrationStreamHealthResolver } from '../../../integration-stream-health.resolver';
import { ALL_INBOUND_STREAMS } from '../../../types';
import type { ErpIntegrationPluginOptions } from '../../../types';

let dataSource: DataSource;
let inbox: IntegrationInboxService;
let resolver: IntegrationStreamHealthResolver;
let lagRows: KafkaConsumerLagEntry[] = [];

const { schema, extra } = testSchemaOptions('erp_integration_stream_health');

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
    inbox = new IntegrationInboxService(dataSource);
    const topics = Object.fromEntries(ALL_INBOUND_STREAMS.map(s => [s, `topic-${s}`]));
    resolver = new IntegrationStreamHealthResolver(
        { kafkaConsumer: { topics } } as unknown as ErpIntegrationPluginOptions,
        { getRepository: () => ({ find: async () => lagRows }) } as unknown as DataSource,
        new IntegrationInboxHealthService(dataSource),
        new IntegrationOutboxHealthService(dataSource),
        { getLatestVersion: async () => '99.0.0' } as unknown as ContractVersionClient,
        new VariantUnitHealthService(dataSource),
    );
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
    lagRows = [];
    await dataSource.getRepository(IntegrationOutboxEntry).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('integrationStreamHealth', () => {
    it('returns every consumed stream with zero backlog, and the contract-only ignored streams', async () => {
        const { streams } = await resolver.integrationStreamHealth();
        const byStream = Object.fromEntries(streams.map(s => [s.stream, s]));

        expect(byStream.bank).toMatchObject({ pending: 0, failed: 0, lag: null, drift: null });
        expect(byStream['order-change-result']).toMatchObject({ consumed: false, drift: null });
        expect(streams.filter(s => s.drift !== null)).toEqual([]);
    });

    it('merges seeded inbox rows and lag rows into the stream row', async () => {
        await inbox.enqueue({
            stream: 'bank',
            entityId: 'b-1',
            version: '1',
            sourceEventId: 'evt-health-1',
            payload: {},
        });
        lagRows = [
            {
                topic: 'topic-bank',
                stream: 'bank',
                partition: 0,
                committedOffset: '5',
                endOffset: '9',
                lag: '4',
                polledAt: new Date(),
            } as KafkaConsumerLagEntry,
        ];

        const { streams } = await resolver.integrationStreamHealth();
        const bank = streams.find(s => s.stream === 'bank')!;

        expect(bank.pending).toBe(1);
        expect(bank.oldestPendingAt).toBeInstanceOf(Date);
        expect(bank.lag).toMatchObject({ topic: 'topic-bank', totalLag: '4' });
    });

    it('counts a handler no-op of the last 24 h on the stream row, with its reason', async () => {
        const row = await inbox.enqueue({
            stream: 'bank',
            entityId: 'b-noop',
            version: '1',
            sourceEventId: 'evt-noop',
            payload: {},
        });
        await inbox.markProcessed(row.id, 'noop', 'bank b-noop: missing name/bik, skipping');

        const { streams } = await resolver.integrationStreamHealth();

        expect(streams.find(st => st.stream === 'bank')).toMatchObject({
            noop24h: 1,
            lastNoopReason: 'bank b-noop: missing name/bik, skipping',
            pending: 0,
        });
    });

    it('flags inbox rows for a stream unknown to contract and config', async () => {
        await dataSource.query(
            `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status)
             VALUES ('ghost-stream', 'g-1', '1', 'evt-ghost', '{}', 'pending')`,
        );

        const { streams } = await resolver.integrationStreamHealth();

        expect(streams.find(s => s.stream === 'ghost-stream')).toMatchObject({
            drift: 'UNKNOWN_STREAM',
            pending: 1,
        });
    });

    it('reports contract version drift against the latest published version', async () => {
        const { versionDrift } = await resolver.integrationStreamHealth();
        expect(versionDrift).toMatchObject({ latest: '99.0.0', status: 'BEHIND' });
    });
});

describe('integrationOutboxHealth', () => {
    it('groups outbox rows per event type with pending, failed, oldest pending and last error', async () => {
        const repo = dataSource.getRepository(IntegrationOutboxEntry);
        await repo.save([
            { eventId: randomUUID(), eventType: 'order.submitted', payload: {}, status: 'pending' },
            {
                eventId: randomUUID(),
                eventType: 'order.submitted',
                payload: {},
                status: 'failed',
                retryCount: 5,
                lastError: 'broker down',
                lastErrorAt: new Date(),
            },
            {
                eventId: randomUUID(),
                eventType: 'order.cancelled',
                payload: {},
                status: 'published',
                publishedAt: new Date(),
            },
        ]);

        const rows = await resolver.integrationOutboxHealth();
        const byType = Object.fromEntries(rows.map(r => [r.eventType, r]));

        expect(byType['order.submitted']).toMatchObject({
            pending: 1,
            failed: 1,
            lastError: 'broker down',
        });
        expect(byType['order.submitted'].oldestPendingAt).toBeInstanceOf(Date);
        expect(byType['order.cancelled']).toMatchObject({ pending: 0, failed: 0, lastError: null });
    });

    it('lists every registered outbound type with zeros for an empty outbox', async () => {
        const rows = await resolver.integrationOutboxHealth();

        expect(rows).toEqual([
            expect.objectContaining({
                eventType: 'order.submitted',
                pending: 0,
                failed: 0,
                skipped: 0,
            }),
        ]);
    });

    it('counts skipped rows separately and reports the last skip reason, not as a publish error', async () => {
        await dataSource.getRepository(IntegrationOutboxEntry).save({
            eventId: randomUUID(),
            eventType: 'order.submitted',
            payload: { orderId: 'o-1' },
            status: 'skipped',
            lastError: 'line 1 has no organizationId',
            lastErrorAt: new Date(),
        });

        const row = (await resolver.integrationOutboxHealth()).find(
            r => r.eventType === 'order.submitted',
        )!;

        expect(row).toMatchObject({
            skipped: 1,
            pending: 0,
            lastSkipReason: 'line 1 has no organizationId',
            lastError: null,
        });
    });
});

describe('variantUnitHealth', () => {
    beforeAll(async () => {
        await dataSource.query(`CREATE TABLE IF NOT EXISTS product_variant (
            id serial PRIMARY KEY, "deletedAt" timestamp, "customFieldsDefaultsalesunitid" varchar)`);
        await dataSource.query(
            `CREATE TABLE IF NOT EXISTS unit_record (id serial PRIMARY KEY, "entityId" varchar)`,
        );
    });

    afterEach(async () => {
        await dataSource.query('TRUNCATE product_variant, unit_record');
    });

    it('counts variants naming a unit and those whose unit has not arrived; ignores deleted and unit-less variants', async () => {
        await dataSource.query(`INSERT INTO unit_record ("entityId") VALUES ('u-known')`);
        await dataSource.query(`INSERT INTO product_variant ("customFieldsDefaultsalesunitid", "deletedAt") VALUES
            ('u-known', NULL), ('u-missing', NULL), ('u-missing', NULL), (NULL, NULL), ('u-missing', now())`);

        expect(await resolver.variantUnitHealth()).toEqual({ total: 3, unitMissing: 2 });
    });

    it('is zero/zero when no variant names a unit', async () => {
        expect(await resolver.variantUnitHealth()).toEqual({ total: 0, unitMissing: 0 });
    });
});
