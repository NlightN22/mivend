import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
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
    it('overlapping sweeps split the backlog: each entry once, and both sweeps publish', async () => {
        const publishedBy: Record<string, string[]> = { a: [], b: [] };
        const rabbitFor = (sweep: string) => ({
            publish: async (_key: string, event: { eventId: string }) => {
                await new Promise(r => setTimeout(r, 50));
                publishedBy[sweep].push(event.eventId);
            },
        });
        const make = (sweep: string) =>
            new SyncService(
                createTestConnection(dataSource),
                rabbitFor(sweep) as never,
                OPTIONS,
                mockLogger as never,
            );
        const ids = Array.from({ length: 6 }, () => randomUUID());
        for (const eventId of ids) {
            await dataSource.transaction(em =>
                make('a').writeToOutbox(
                    { em } as never,
                    {
                        eventId,
                        eventType: 'product.updated',
                        payload: { productId: 'p-1' },
                    } as never,
                    'all-branches',
                ),
            );
        }

        await Promise.all([
            make('a').processOutbox(testRequestContext),
            make('b').processOutbox(testRequestContext),
        ]);

        const all = [...publishedBy.a, ...publishedBy.b];
        expect([...all].sort()).toEqual([...ids].sort());
        expect(publishedBy.a.length).toBeGreaterThan(0);
        expect(publishedBy.b.length).toBeGreaterThan(0);
        const rows = await dataSource.getRepository(SyncOutboxEntry).find();
        expect(rows.every(r => r.status === 'delivered')).toBe(true);
    });
});
