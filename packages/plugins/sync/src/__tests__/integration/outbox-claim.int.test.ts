import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { SyncOutboxEntry } from '../../entities/sync-outbox.entity';
import { SyncService } from '../../sync.service';
import type { SyncPluginOptions } from '../../types';

const OPTIONS: SyncPluginOptions = {
    instanceType: 'central',
    instanceId: 'hub',
    rabbitmq: { url: 'amqp://localhost' },
    maxRetry: 3,
};
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), dlq: vi.fn() };
const { schema, extra } = testSchemaOptions('sync_outbox_claim');

let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [SyncOutboxEntry],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('SyncService.processOutbox claim (integration, real Postgres)', () => {
    it('overlapping sweeps publish each pending entry exactly once', async () => {
        const published: string[] = [];
        const slowRabbit = {
            publish: async (_key: string, event: { eventId: string }) => {
                await new Promise(r => setTimeout(r, 50));
                published.push(event.eventId);
            },
        };
        const make = () =>
            new SyncService(dataSource, slowRabbit as never, OPTIONS, mockLogger as never);
        const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
        for (const eventId of ids) {
            await dataSource.transaction(em =>
                make().writeToOutbox(
                    em,
                    {
                        eventId,
                        eventType: 'product.updated',
                        payload: { productId: 'p-1' },
                    } as never,
                    'all-branches',
                ),
            );
        }

        await Promise.all([make().processOutbox(), make().processOutbox()]);

        expect([...published].sort()).toEqual([...ids].sort());
        const rows = await dataSource.getRepository(SyncOutboxEntry).find();
        expect(rows.every(r => r.status === 'delivered')).toBe(true);
    });
});
