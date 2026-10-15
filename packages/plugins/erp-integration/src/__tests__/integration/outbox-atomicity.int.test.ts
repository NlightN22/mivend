import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationOutboxEntry } from '../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxService } from '../../integration-outbox.service';

// Outbox writes take a caller-supplied EntityManager to join the caller's transaction.
// Dedup relies on the unique eventId index, not on application-level checks.
let dataSource: DataSource;
let outboxService: IntegrationOutboxService;

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
    outboxService = new IntegrationOutboxService();
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationOutboxEntry).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('IntegrationOutboxService atomicity (integration, real Postgres)', () => {
    it('writes a row that commits normally', async () => {
        await dataSource.transaction(async em => {
            await outboxService.writeToOutbox(em, {
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
                await outboxService.writeToOutbox(em, {
                    eventId: duplicateEventId,
                    eventType: 'order.confirmed',
                    payload: { orderId: 'order-a' },
                });
                await outboxService.writeToOutbox(em, {
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
                await outboxService.writeToOutbox(em, {
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
