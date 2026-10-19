import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    createTestConnection,
    testRequestContext,
} from 'shared';
import { testRequestContextService } from '../../test-request-context-service';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxProcessorService } from '../../../integration-outbox-processor.service';
import { IntegrationOutboxService } from '../../../integration-outbox.service';
import { OutboundGateway, outboundSend, outboundSkip } from '../../../outbound-gateway';

// Silent-drop pattern (docs/testing-patterns.md): every enqueue ends as pending rows or one
// skipped row with a reason, atomically, and a skipped row is never published.
let dataSource: DataSource;
let gateway: OutboundGateway;
const publish = vi.fn();

const { schema, extra } = testSchemaOptions('erp_integration_outbound_gateway');
const subject = { orderId: 'order-1', orderCode: 'ORD-1' };
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
    gateway = new OutboundGateway(
        createTestConnection(dataSource),
        new IntegrationOutboxService(createTestConnection(dataSource)),
    );
});

afterEach(async () => {
    await repo().clear();
    publish.mockReset();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('OutboundGateway (integration, real Postgres)', () => {
    it('records a skipped row with the reason and the subject, and the processor never publishes it', async () => {
        const outcome = await gateway.enqueue(testRequestContext, {
            eventType: 'order.confirmed',
            subject,
            build: async () => outboundSkip('line 1 has no organizationId'),
        });

        const rows = await repo().find();
        expect(outcome).toBe('skipped');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            status: 'skipped',
            eventType: 'order.confirmed',
            payload: subject,
            lastError: 'line 1 has no organizationId',
        });

        const processor = new IntegrationOutboxProcessorService(
            createTestConnection(dataSource),
            { publish } as never,
            testRequestContextService,
        );
        await processor.processPendingBatch();
        expect(publish).not.toHaveBeenCalled();
    });

    it('a successful build writes pending rows and no skipped row', async () => {
        await gateway.enqueue(testRequestContext, {
            eventType: 'order.confirmed',
            subject,
            build: async () => outboundSend([{ payload: { n: 1 } }, { payload: { n: 2 } }]),
        });

        const rows = await repo().find();
        expect(rows.map(r => r.status)).toEqual(['pending', 'pending']);
    });

    it('writes all events of one enqueue in one transaction: a failing second write leaves none', async () => {
        await expect(
            gateway.enqueue(testRequestContext, {
                eventType: 'order.confirmed',
                subject,
                build: async () =>
                    outboundSend([
                        { eventId: '11111111-1111-4111-8111-111111111111', payload: { n: 1 } },
                        { eventId: '11111111-1111-4111-8111-111111111111', payload: { n: 2 } },
                    ]),
            }),
        ).rejects.toThrow();

        expect(await repo().count()).toBe(0);
    });

    it('joins a caller transaction: rolling it back removes the skipped row too', async () => {
        await expect(
            createTestConnection(dataSource).withTransaction(testRequestContext, async txCtx => {
                await gateway.enqueue(txCtx, {
                    eventType: 'order.confirmed',
                    subject,
                    build: async () => outboundSkip('reason'),
                });
                throw new Error('rollback business write');
            }),
        ).rejects.toThrow('rollback business write');

        expect(await repo().count()).toBe(0);
    });

    it('records a skipped row and rethrows when the builder throws', async () => {
        await expect(
            gateway.enqueue(testRequestContext, {
                eventType: 'order.confirmed',
                subject,
                build: async () => {
                    throw new Error('lookup failed');
                },
            }),
        ).rejects.toThrow('lookup failed');

        const rows = await repo().find();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            status: 'skipped',
            lastError: 'build failed: lookup failed',
        });
    });

    it('rolls back what a failing build wrote and records the failure after the rollback', async () => {
        const outbox = new IntegrationOutboxService(createTestConnection(dataSource));
        await expect(
            gateway.enqueue(testRequestContext, {
                eventType: 'order.confirmed',
                subject,
                lockKey: 'reserve-order:order-1',
                build: async txCtx => {
                    await outbox.writeToOutbox(txCtx, { eventType: 'probe', payload: {} });
                    throw new Error('lookup failed');
                },
            }),
        ).rejects.toThrow('lookup failed');

        const rows = await repo().find();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            status: 'skipped',
            lastError: 'build failed: lookup failed',
        });
    });

    it('hasActiveEntry matches only the given orderId and an active status', async () => {
        await gateway.enqueue(testRequestContext, {
            eventType: 'order.confirmed',
            subject: { orderId: 'order-active' },
            build: async () => outboundSend([{ payload: { orderId: 'order-active' } }]),
        });
        const [row] = await repo().find();
        await repo().update({ id: row.id }, { status: 'failed' });
        await gateway.enqueue(testRequestContext, {
            eventType: 'order.confirmed',
            subject: { orderId: 'order-other' },
            build: async () => outboundSend([{ payload: { orderId: 'order-other' } }]),
        });

        expect(
            await gateway.hasActiveEntry(testRequestContext, 'order.confirmed', 'order-active'),
        ).toBe(false);
        expect(
            await gateway.hasActiveEntry(testRequestContext, 'order.confirmed', 'order-other'),
        ).toBe(true);
        expect(
            await gateway.hasActiveEntry(testRequestContext, 'order.confirmed', 'order-missing'),
        ).toBe(false);
    });

    // Mirrors OrderSubmittedListener's real guard shape (check in the build, under the gateway's
    // reserve-order:<id> lock) — proves the lock closes the race, not just the guard's read.

    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

    // Widens the check-then-insert window to something reliably reproducible (verified: removing
    // the lock below makes this fail every run) — proves the lock, not scheduling luck, closes it.
    function guardedSubmit(orderId: string): Promise<'queued' | 'skipped'> {
        return gateway.enqueue(testRequestContext, {
            eventType: 'order.confirmed',
            subject: { orderId },
            lockKey: `reserve-order:${orderId}`,
            build: async txCtx => {
                if (await gateway.hasActiveEntry(txCtx, 'order.confirmed', orderId)) {
                    return outboundSkip('already submitted');
                }
                await sleep(20);
                return outboundSend([{ payload: { orderId } }]);
            },
        });
    }

    it('two concurrent submits for the same order under the real lock produce exactly one row', async () => {
        const orderId = 'order-concurrent-1';

        const outcomes = await Promise.all([guardedSubmit(orderId), guardedSubmit(orderId)]);

        expect(outcomes.sort()).toEqual(['queued', 'skipped']);
        const rows = await repo()
            .createQueryBuilder('outbox')
            .where("outbox.payload->>'orderId' = :orderId", { orderId })
            .andWhere("outbox.status = 'pending'")
            .getMany();
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('pending');
    });
});
