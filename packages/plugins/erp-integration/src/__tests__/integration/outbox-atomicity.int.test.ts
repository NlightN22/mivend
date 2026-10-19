import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import {
    ctxQuery,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    createTestConnection,
    testRequestContext,
} from 'shared';

import { IntegrationOutboxEntry } from '../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxService } from '../../integration-outbox.service';
import { OutboundGateway, outboundSend } from '../../outbound-gateway';

// Outbox writes take the caller's ctx to join its transaction.
// Dedup relies on the unique eventId index, not on application-level checks.
let dataSource: DataSource;
let outboxService: IntegrationOutboxService;
let gateway: OutboundGateway;
const txCtx = (em: EntityManager): RequestContext => ({ em }) as unknown as RequestContext;

const { schema, extra } = testSchemaOptions('erp_integration_outbox_atomicity');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationOutboxEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    outboxService = new IntegrationOutboxService(createTestConnection(dataSource));
    gateway = new OutboundGateway(createTestConnection(dataSource), outboxService);
    await dataSource.query('CREATE TABLE business_change (id serial PRIMARY KEY, note text)');
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationOutboxEntry).clear();
    await dataSource.query('DELETE FROM business_change');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('IntegrationOutboxService atomicity (integration, real Postgres)', () => {
    it('writes a row that commits normally', async () => {
        await dataSource.transaction(async em => {
            await outboxService.writeToOutbox(txCtx(em), {
                eventType: 'order.confirmed',
                payload: { orderId: 'order-1' },
            });
        });

        const rows = await dataSource.getRepository(IntegrationOutboxEntry).find();
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('pending');
        expect(rows[0].eventType).toBe('order.confirmed');
    });

    it('a duplicate eventId inside the same transaction rolls back the whole transaction', async () => {
        const duplicateEventId = 'fixed-event-id-for-collision-test';

        await expect(
            dataSource.transaction(async em => {
                await outboxService.writeToOutbox(txCtx(em), {
                    eventId: duplicateEventId,
                    eventType: 'order.confirmed',
                    payload: { orderId: 'order-a' },
                });
                await outboxService.writeToOutbox(txCtx(em), {
                    eventId: duplicateEventId,
                    eventType: 'order.confirmed',
                    payload: { orderId: 'order-b' },
                });
            }),
        ).rejects.toThrow();

        const rows = await dataSource.getRepository(IntegrationOutboxEntry).find();
        expect(rows).toHaveLength(0);
    });

    it('a transaction that writes to the outbox then throws for an unrelated reason leaves no row behind', async () => {
        await expect(
            dataSource.transaction(async em => {
                await outboxService.writeToOutbox(txCtx(em), {
                    eventType: 'order.confirmed',
                    payload: { orderId: 'order-never-persisted' },
                });
                throw new Error('simulated failure after the outbox write, before commit');
            }),
        ).rejects.toThrow('simulated failure after the outbox write, before commit');

        const rows = await dataSource.getRepository(IntegrationOutboxEntry).find();
        expect(rows).toHaveLength(0);
    });
});

describe('OutboundGateway atomicity with the business change (integration, real Postgres)', () => {
    const connection = (): ReturnType<typeof createTestConnection> =>
        createTestConnection(dataSource);
    const changeAndEnqueue = async (ctx: RequestContext, fail: boolean): Promise<void> => {
        await ctxQuery<unknown>(
            connection(),
            ctx,
            'INSERT INTO business_change (note) VALUES ($1)',
            ['order placed'],
        );
        await gateway.enqueue(ctx, {
            eventType: 'order.confirmed',
            subject: { orderId: 'order-1' },
            build: async () => outboundSend([{ payload: { orderId: 'order-1' } }]),
        });
        if (fail) throw new Error('business step failed after the enqueue');
    };

    it('commits the business change and the outbox row together', async () => {
        await connection().withTransaction(testRequestContext, ctx => changeAndEnqueue(ctx, false));

        expect(await dataSource.getRepository(IntegrationOutboxEntry).count()).toBe(1);
        expect(await dataSource.query('SELECT 1 FROM business_change')).toHaveLength(1);
    });

    it('rolls the outbox row back with the business change', async () => {
        await expect(
            connection().withTransaction(testRequestContext, ctx => changeAndEnqueue(ctx, true)),
        ).rejects.toThrow('business step failed after the enqueue');

        expect(await dataSource.getRepository(IntegrationOutboxEntry).count()).toBe(0);
        expect(await dataSource.query('SELECT 1 FROM business_change')).toHaveLength(0);
    });
});
