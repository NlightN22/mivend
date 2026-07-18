import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

// Sync rule #1 (AGENTS.md): an outbox write must be atomic with the transaction it participates
// in — a rollback must never leave a partial outbox state. plugin-sync's actual write paths
// (order-sync.service.ts, producer-registry.ts, sync.service.processErpChanges) never pair a
// business-entity write with an outbox write in the same EntityManager — every business write
// plugin-sync reacts to already committed via Vendure core or another plugin before plugin-sync's
// own subscriber runs. The atomicity risk that DOES exist in this plugin's own code is
// processErpChanges's multi-event batch: it writes several outbox rows inside one
// `dataSource.transaction`, so a failure partway through must roll back the whole batch, not
// leave the first N events persisted. sync-cycle.test.ts already covers publish/retry/DLQ/
// idempotency/ordering against RabbitMQ — this file only covers the DB-transaction boundary,
// which currently has zero coverage (processErpChanges has no test at all).
const HUB_OPTIONS: SyncPluginOptions = {
    instanceType: 'central',
    instanceId: 'hub',
    redis: { host: 'localhost', port: 6379 },
    rabbitmq: { url: 'amqp://mivend:mivend@localhost:5672' },
    maxRetry: 3,
};

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), dlq: vi.fn() };

let dataSource: DataSource;
let syncService: SyncService;

const { schema, extra } = testSchemaOptions('outbox_atomicity');

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

    // RabbitMQService is never invoked in this file — processErpChanges/writeToOutbox only write
    // to Postgres, delivery is a separate concern already covered by sync-cycle.test.ts.
    syncService = new SyncService(dataSource, {} as never, HUB_OPTIONS, mockLogger as never);
});

afterEach(async () => {
    await dataSource.getRepository(SyncOutboxEntry).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('SyncService outbox atomicity (integration, real Postgres)', () => {
    it('processErpChanges writes every event in the batch atomically — all rows present after a clean commit', async () => {
        await syncService.processErpChanges({
            cursor: new Date(),
            events: [
                {
                    type: 'price.updated',
                    payload: {
                        variantId: 'variant-1',
                        priceTypeCode: 'retail',
                        amount: 1000,
                        currencyCode: 'RUB',
                    },
                },
                {
                    type: 'price.updated',
                    payload: {
                        variantId: 'variant-2',
                        priceTypeCode: 'retail',
                        amount: 2000,
                        currencyCode: 'RUB',
                    },
                },
                {
                    type: 'price.updated',
                    payload: {
                        variantId: 'variant-3',
                        priceTypeCode: 'retail',
                        amount: 3000,
                        currencyCode: 'RUB',
                    },
                },
            ],
        });

        const rows = await dataSource.getRepository(SyncOutboxEntry).find();
        expect(rows).toHaveLength(3);
        expect(rows.every(row => row.status === 'pending' && row.target === 'all-branches')).toBe(
            true,
        );
    });

    it('a failure partway through a batch rolls back the whole transaction — no partial outbox rows survive', async () => {
        const duplicateEventId = 'fixed-event-id-for-collision-test';

        await expect(
            dataSource.transaction(async em => {
                await syncService.writeToOutbox(
                    em,
                    {
                        eventId: duplicateEventId,
                        eventType: 'price.updated',
                        payload: {
                            variantId: 'variant-a',
                            priceTypeCode: 'retail',
                            amount: 1000,
                            currencyCode: 'RUB',
                        },
                    },
                    'all-branches',
                );
                // Same eventId again inside the SAME transaction — sync_outbox's unique index on
                // event_id rejects it, forcing the whole transaction (both writes) to roll back.
                await syncService.writeToOutbox(
                    em,
                    {
                        eventId: duplicateEventId,
                        eventType: 'price.updated',
                        payload: {
                            variantId: 'variant-b',
                            priceTypeCode: 'retail',
                            amount: 2000,
                            currencyCode: 'RUB',
                        },
                    },
                    'all-branches',
                );
            }),
        ).rejects.toThrow();

        const rows = await dataSource.getRepository(SyncOutboxEntry).find();
        expect(rows).toHaveLength(0);
    });

    it('a transaction that writes to the outbox and then throws for an unrelated reason leaves no row behind', async () => {
        await expect(
            dataSource.transaction(async em => {
                await syncService.writeToOutbox(
                    em,
                    {
                        eventType: 'price.updated',
                        payload: {
                            variantId: 'variant-never-persisted',
                            priceTypeCode: 'retail',
                            amount: 1000,
                            currencyCode: 'RUB',
                        },
                    },
                    'all-branches',
                );
                throw new Error('simulated failure after the outbox write, before commit');
            }),
        ).rejects.toThrow('simulated failure after the outbox write, before commit');

        const rows = await dataSource.getRepository(SyncOutboxEntry).find();
        expect(rows).toHaveLength(0);
    });
});
