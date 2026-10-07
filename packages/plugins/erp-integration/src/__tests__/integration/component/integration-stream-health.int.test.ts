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
import { IntegrationInboxService } from '../../../integration-inbox.service';
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
        entities: [IntegrationInboxEvent],
        synchronize: true,
    });
    await dataSource.initialize();
    inbox = new IntegrationInboxService(dataSource);
    const topics = Object.fromEntries(ALL_INBOUND_STREAMS.map(s => [s, `topic-${s}`]));
    resolver = new IntegrationStreamHealthResolver(
        { kafkaConsumer: { topics } } as unknown as ErpIntegrationPluginOptions,
        { getRepository: () => ({ find: async () => lagRows }) } as unknown as DataSource,
        inbox,
    );
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
    lagRows = [];
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

    it('flags inbox rows for a stream unknown to contract and config', async () => {
        await dataSource.query(
            `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status)
             VALUES ('ghost-stream', 'g-1', '1', 'evt-ghost', '{}', 'pending')`,
        );

        const { streams } = await resolver.integrationStreamHealth();

        expect(streams.find(s => s.stream === 'ghost-stream')).toMatchObject({
            drift: 'UNKNOWN_INBOX_STREAM',
            pending: 1,
        });
    });
});
