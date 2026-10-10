import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxService } from '../../../integration-outbox.service';
import { OrderCancellationAdapter } from '../../../order-cancellation.adapter';
import { OutboundGateway } from '../../../outbound-gateway';

// The ERP side of the cancel flow on real Postgres: outbox state of the confirmed event, the
// conditional skip against the publisher's row lock, and one cancel-requested per order.
let dataSource: DataSource;
let adapter: OrderCancellationAdapter;
const ctx = {} as never;

const { schema, extra } = testSchemaOptions('erp_integration_order_cancellation');
const repo = (): Repository<IntegrationOutboxEntry> =>
    dataSource.getRepository(IntegrationOutboxEntry);

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
    const outbox = new IntegrationOutboxService();
    const gateway = new OutboundGateway(dataSource, outbox);
    adapter = new OrderCancellationAdapter(gateway, {
        register: () => undefined,
    } as never);
});

afterEach(async () => {
    await repo().clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const confirmed = (
    orderId: string,
    status: IntegrationOutboxEntry['status'],
): Promise<IntegrationOutboxEntry> =>
    repo().save(
        repo().create({
            eventId: randomUUID(),
            eventType: 'order.confirmed',
            payload: { orderId },
            status,
        }),
    );

describe('submissionState', () => {
    it.each([
        ['none', []],
        ['pending', ['pending']],
        ['pending', ['failed']],
        ['sent', ['published']],
        ['sent', ['pending', 'published']],
        ['none', ['skipped', 'resolved']],
    ] as const)('is %s for rows %j', async (expected, statuses) => {
        for (const status of statuses) await confirmed('order-1', status);
        await confirmed('order-other', 'published');

        expect(await adapter.submissionState(ctx, 'order-1')).toBe(expected);
    });
});

describe('skipPendingSubmission', () => {
    it('marks waiting rows skipped with the reason and leaves other orders alone', async () => {
        const waiting = await confirmed('order-1', 'pending');
        const failed = await confirmed('order-1', 'failed');
        const other = await confirmed('order-2', 'pending');

        expect(await adapter.skipPendingSubmission(ctx, 'order-1', 'cancelled first')).toBe(true);

        for (const id of [waiting.id, failed.id]) {
            expect(await repo().findOneByOrFail({ id })).toMatchObject({
                status: 'skipped',
                lastError: 'cancelled first',
            });
        }
        expect((await repo().findOneByOrFail({ id: other.id })).status).toBe('pending');
    });

    it('reports false for an already published row, which stays published', async () => {
        const row = await confirmed('order-1', 'published');

        expect(await adapter.skipPendingSubmission(ctx, 'order-1', 'late')).toBe(false);
        expect((await repo().findOneByOrFail({ id: row.id })).status).toBe('published');
    });

    // The publisher holds the row lock while it publishes; the skip must wait and then find the
    // row published, never both skip it and let it go out.
    it('waits for a publisher holding the row and loses to it', async () => {
        const row = await confirmed('order-1', 'pending');
        const publisher = await dataSource.createQueryRunner();
        await publisher.connect();
        await publisher.startTransaction();
        await publisher.query(`SELECT id FROM integration_outbox WHERE id = $1 FOR UPDATE`, [
            row.id,
        ]);

        const skip = adapter.skipPendingSubmission(ctx, 'order-1', 'late');
        await new Promise(resolve => setTimeout(resolve, 150));
        await publisher.query(`UPDATE integration_outbox SET status = 'published' WHERE id = $1`, [
            row.id,
        ]);
        await publisher.commitTransaction();
        await publisher.release();

        expect(await skip).toBe(false);
        expect((await repo().findOneByOrFail({ id: row.id })).status).toBe('published');
    });
});

describe('requestCancel', () => {
    const subject = { orderId: 'order-1', orderUuid: randomUUID(), orderCode: 'ORD-1' };

    it('publishing twice leaves exactly one cancel-requested row, keyed by the order uuid', async () => {
        await adapter.requestCancel(ctx, subject);
        await adapter.requestCancel(ctx, subject);

        const rows = await repo().find({ where: { eventType: 'order.cancel-requested' } });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: 'pending' });
        expect(rows[0].payload).toMatchObject({
            type: 'cancel-requested',
            orderUuid: subject.orderUuid,
            eventId: rows[0].eventId,
        });
    });

    it('a different order gets its own request', async () => {
        await adapter.requestCancel(ctx, subject);
        await adapter.requestCancel(ctx, { ...subject, orderUuid: randomUUID() });

        expect(await repo().count({ where: { eventType: 'order.cancel-requested' } })).toBe(2);
    });
});
