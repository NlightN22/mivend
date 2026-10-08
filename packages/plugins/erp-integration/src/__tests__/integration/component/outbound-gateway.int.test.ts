import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

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
const repo = () => dataSource.getRepository(IntegrationOutboxEntry);

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
    gateway = new OutboundGateway(dataSource, new IntegrationOutboxService());
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
        const outcome = await gateway.enqueue({
            eventType: 'order.submitted',
            subject,
            build: async () => outboundSkip('line 1 has no organizationId'),
        });

        const rows = await repo().find();
        expect(outcome).toBe('skipped');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            status: 'skipped',
            eventType: 'order.submitted',
            payload: subject,
            lastError: 'line 1 has no organizationId',
        });

        const processor = new IntegrationOutboxProcessorService(dataSource, { publish } as never);
        await processor.processPendingBatch();
        expect(publish).not.toHaveBeenCalled();
    });

    it('a successful build writes pending rows and no skipped row', async () => {
        await gateway.enqueue({
            eventType: 'order.submitted',
            subject,
            build: async () => outboundSend([{ payload: { n: 1 } }, { payload: { n: 2 } }]),
        });

        const rows = await repo().find();
        expect(rows.map(r => r.status)).toEqual(['pending', 'pending']);
    });

    it('writes all events of one enqueue in one transaction: a failing second write leaves none', async () => {
        await expect(
            gateway.enqueue({
                eventType: 'order.submitted',
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
            dataSource.transaction(async em => {
                await gateway.enqueue(
                    {
                        eventType: 'order.submitted',
                        subject,
                        build: async () => outboundSkip('reason'),
                    },
                    em,
                );
                throw new Error('rollback business write');
            }),
        ).rejects.toThrow('rollback business write');

        expect(await repo().count()).toBe(0);
    });

    it('records a skipped row and rethrows when the builder throws', async () => {
        await expect(
            gateway.enqueue({
                eventType: 'order.submitted',
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
});
