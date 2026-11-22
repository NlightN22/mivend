import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntitySchema } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { ExchangeHealthSnapshot } from '../../entities/exchange-health-snapshot.entity';
import { ExchangeHealthReadError } from '../../exchange-health';
import type { ExchangeHealth } from '../../exchange-health';
import { ExchangeHealthPollerService } from '../../exchange-health-poller.service';
import { ExchangeHealthResolver } from '../../exchange-health.resolver';

// VendureEntity's id column is only wired up by Vendure's own bootstrap, so the table is mapped here.
const snapshotSchema = new EntitySchema({
    name: 'ExchangeHealthSnapshot',
    target: ExchangeHealthSnapshot,
    tableName: 'exchange_health_snapshot',
    columns: {
        id: { type: Number, primary: true, generated: true },
        createdAt: { type: 'timestamp', createDate: true },
        updatedAt: { type: 'timestamp', updateDate: true },
        key: { type: String },
        state: { type: String },
        reason: { type: String, nullable: true },
        health: { type: 'jsonb', nullable: true },
        polledAt: { type: 'timestamp' },
    },
    uniques: [{ columns: ['key'] }],
});

const { schema, extra } = testSchemaOptions('erp_exchange_health_snapshot');
let dataSource: DataSource;
let answer: () => Promise<ExchangeHealth>;
let poller: ExchangeHealthPollerService;
let resolver: ExchangeHealthResolver;

const health = (status: ExchangeHealth['status']): ExchangeHealth => ({
    generatedAt: '2026-11-20T10:00:00Z',
    status,
    channels: [],
    publish: null,
    mappingErrors: [],
    failures: {
        status: 'OK',
        inboxFailedLast24h: 0,
        outboxFailedLast24h: 0,
        outboundRejectedLast24h: 0,
    },
    resync: { pending: 0, delivered: 0, acknowledgedLast24h: 0, rejectedLast24h: 0, open: [] },
});

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [snapshotSchema],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = createTestConnection(dataSource);
    poller = new ExchangeHealthPollerService({ fetchHealth: () => answer() } as never, connection, {
        create: async () => testRequestContext,
    } as never);
    resolver = new ExchangeHealthResolver({ instanceType: 'central' } as never, connection);
});

afterEach(() => dataSource.getRepository(ExchangeHealthSnapshot).clear());

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('exchange health snapshot on real Postgres', () => {
    it('keeps a single row across repeated and concurrent polls', async () => {
        answer = async () => health('DEGRADED');
        await Promise.all(Array.from({ length: 8 }, () => poller.pollOnce()));
        await poller.pollOnce();
        expect(await dataSource.getRepository(ExchangeHealthSnapshot).count()).toBe(1);
        const view = await resolver.exchangeHealth(testRequestContext);
        expect(view).toMatchObject({ state: 'DEGRADED', reason: null });
        expect(view.health?.status).toBe('DEGRADED');
    });

    it('a failed read replaces a stored OK with UNKNOWN and its reason, and a recovery brings it back', async () => {
        answer = async () => health('OK');
        await poller.pollOnce();
        answer = async () => {
            throw new ExchangeHealthReadError('UNAUTHORIZED', 'returned 401');
        };
        await poller.pollOnce();
        expect(await resolver.exchangeHealth(testRequestContext)).toMatchObject({
            state: 'UNKNOWN',
            reason: 'UNAUTHORIZED',
            health: null,
        });
        answer = async () => health('OK');
        await poller.pollOnce();
        expect((await resolver.exchangeHealth(testRequestContext)).state).toBe('OK');
    });

    it('reads as NEVER_POLLED with no row and as STALE when the row is old', async () => {
        expect(await resolver.exchangeHealth(testRequestContext)).toMatchObject({
            state: 'UNKNOWN',
            reason: 'NEVER_POLLED',
        });
        answer = async () => health('OK');
        await poller.pollOnce();
        await dataSource.query(
            `UPDATE exchange_health_snapshot SET "polledAt" = now() - interval '10 minutes'`,
        );
        expect(await resolver.exchangeHealth(testRequestContext)).toMatchObject({
            state: 'UNKNOWN',
            reason: 'STALE',
        });
    });
});
