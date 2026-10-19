import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { EventBus } from '@vendure/core';
import { ReservationConfirmedEvent, ReservationReleasedEvent } from '@mivend/plugin-reservation';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ReservationConsumer } from '../../consumers/reservation.consumer';
import { SyncOutboxEntry } from '../../entities/sync-outbox.entity';
import { SyncService } from '../../sync.service';
import type { SyncPluginOptions } from '../../types';

// An order-line edit releases an order's reservation through ReservationReleasedEvent (#233): the ERP
// outbox must get exactly one reservation.released per reservation, paired with its reservation.created.
const OPTIONS: SyncPluginOptions = {
    instanceType: 'central',
    instanceId: 'hub',
    rabbitmq: { url: 'amqp://localhost' },
    maxRetry: 3,
};
const { schema, extra } = testSchemaOptions('reservation_consumer_outbox');
let dataSource: DataSource;
const handlers = new Map<unknown, (event: unknown) => Promise<void>>();

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
    const eventBus = {
        ofType: (eventClass: unknown) => ({
            subscribe: (fn: (event: unknown) => Promise<void>) => handlers.set(eventClass, fn),
        }),
    } as unknown as EventBus;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), dlq: vi.fn() };
    const syncService = new SyncService(
        createTestConnection(dataSource),
        {} as never,
        OPTIONS,
        logger as never,
    );
    new ReservationConsumer(
        eventBus,
        syncService,
        createTestConnection(dataSource),
        { create: async () => ({}) } as never,
        OPTIONS,
    ).onApplicationBootstrap();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(SyncOutboxEntry).clear();
});

const createdId = (n: number): string => `00000000-0000-4000-8000-00000000000${n}`;
const releasedId = (n: number): string => `00000000-0000-4000-9000-00000000000${n}`;

const reservation = (n: number, released: boolean): never =>
    ({
        id: `res-${n}`,
        productVariantId: `variant-${n}`,
        quantity: n,
        expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        erpOperationId: createdId(n),
        erpReleaseOperationId: released ? releasedId(n) : null,
    }) as never;

describe('ReservationConsumer outbox (integration, real Postgres)', () => {
    it('writes one reservation.released per reservation, paired with reservation.created, across two edits', async () => {
        for (const n of [1, 2]) {
            await handlers.get(ReservationConfirmedEvent)!(
                new ReservationConfirmedEvent({} as never, reservation(n, false), 'ORD-1'),
            );
        }
        // First edit releases both reservations; the second finds none active and publishes nothing.
        for (const n of [1, 2]) {
            await handlers.get(ReservationReleasedEvent)!(
                new ReservationReleasedEvent({} as never, reservation(n, true), 'ORD-1'),
            );
        }

        // The subscriber is fire-and-forget (subscribeAndLog), so wait for the writes.
        await vi.waitFor(async () =>
            expect(await dataSource.getRepository(SyncOutboxEntry).count()).toBe(4),
        );
        const rows = await dataSource.getRepository(SyncOutboxEntry).find({ order: { id: 'ASC' } });
        const released = rows.filter(r => r.eventType === 'reservation.released');
        const created = rows.filter(r => r.eventType === 'reservation.created');
        expect(created).toHaveLength(2);
        expect(released).toHaveLength(2);
        expect(released.map(r => r.eventId).sort()).toEqual([releasedId(1), releasedId(2)]);
        for (const row of released) {
            const pair = created.find(
                c => c.payload['reservationId'] === row.payload['reservationId'],
            );
            expect(pair).toBeDefined();
            expect(row.target).toBe('erp');
        }
    });
});
