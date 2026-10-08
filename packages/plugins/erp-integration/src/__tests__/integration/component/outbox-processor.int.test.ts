import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxRecoveryService } from '../../../integration-outbox-recovery.service';
import { IntegrationOutboxProcessorService } from '../../../integration-outbox-processor.service';

// Component chain: pending row -> sweep -> publish -> published / retry / dead-letter. Invoked
// directly (processPendingBatch), never waiting on a real BullMQ scheduler interval, per
// docs/testing-strategy.md's "Worker testing". KafkaProducerService.publish is mocked — this
// suite proves the outbox lifecycle transitions, not real Kafka connectivity (see this plugin's
// test plan's "Deliberate omissions": no live broker in this repo's test infra).
let dataSource: DataSource;
const publish = vi.fn();

const { schema, extra } = testSchemaOptions('erp_integration_outbox_processor');

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
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationOutboxEntry).clear();
    publish.mockReset();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

function makeProcessor(): IntegrationOutboxProcessorService {
    return new IntegrationOutboxProcessorService(dataSource, { publish } as never);
}

async function insertPending(
    overrides: Partial<IntegrationOutboxEntry> = {},
): Promise<IntegrationOutboxEntry> {
    const repo = dataSource.getRepository(IntegrationOutboxEntry);
    const entry = repo.create({
        eventId: overrides.eventId ?? randomUUID(),
        eventType: 'order.submitted',
        payload: { orderId: 'order-1' },
        status: 'pending',
        retryCount: 0,
        ...overrides,
    });
    return repo.save(entry);
}

describe('IntegrationOutboxProcessorService.processPendingBatch (component)', () => {
    it('publishes a pending row and marks it published', async () => {
        publish.mockResolvedValueOnce(undefined);
        const entry = await insertPending();

        await makeProcessor().processPendingBatch();

        const reloaded = await dataSource.getRepository(IntegrationOutboxEntry).findOneOrFail({
            where: { id: entry.id },
        });
        expect(reloaded.status).toBe('published');
        expect(reloaded.publishedAt).not.toBeNull();
        expect(publish).toHaveBeenCalledWith(entry.eventId, 'order.submitted', {
            orderId: 'order-1',
        });
    });

    it('a publish failure keeps the row pending, records the error and schedules a backed-off retry', async () => {
        publish.mockRejectedValueOnce(new Error('broker unreachable'));
        const entry = await insertPending();

        await makeProcessor().processPendingBatch();

        const reloaded = await dataSource.getRepository(IntegrationOutboxEntry).findOneOrFail({
            where: { id: entry.id },
        });
        expect(reloaded.status).toBe('pending');
        expect(reloaded.retryCount).toBe(1);
        expect(reloaded.lastError).toContain('broker unreachable');
        expect(reloaded.firstFailedAt).not.toBeNull();
        expect(reloaded.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('does not retry a row before its nextRetryAt, and retries it once due', async () => {
        publish.mockResolvedValue(undefined);
        const entry = await insertPending({ nextRetryAt: new Date(Date.now() + 60_000) });

        await makeProcessor().processPendingBatch();
        expect(publish).not.toHaveBeenCalled();

        await dataSource
            .getRepository(IntegrationOutboxEntry)
            .update(entry.id, { nextRetryAt: new Date(Date.now() - 1000) });
        await makeProcessor().processPendingBatch();
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it('survives many failures inside the wall-clock budget: a broker outage never dead-letters', async () => {
        publish.mockRejectedValue(new Error('broker down'));
        const entry = await insertPending({ retryCount: 50, firstFailedAt: new Date() });

        await makeProcessor().processPendingBatch();

        const reloaded = await dataSource.getRepository(IntegrationOutboxEntry).findOneOrFail({
            where: { id: entry.id },
        });
        expect(reloaded.status).toBe('pending');
    });

    it('dead-letters (failed) once the wall-clock budget since the first failure is spent, and never retries it again', async () => {
        publish.mockRejectedValueOnce(new Error('still down'));
        const entry = await insertPending({
            retryCount: 9,
            firstFailedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        });

        await makeProcessor().processPendingBatch();

        const reloaded = await dataSource.getRepository(IntegrationOutboxEntry).findOneOrFail({
            where: { id: entry.id },
        });
        expect(reloaded.status).toBe('failed');
        expect(reloaded.nextRetryAt).toBeNull();

        publish.mockClear();
        await makeProcessor().processPendingBatch();
        expect(publish).not.toHaveBeenCalled();
    });

    it('does not publish an already-published row again on a later sweep', async () => {
        await insertPending({ status: 'published' });

        await makeProcessor().processPendingBatch();

        expect(publish).not.toHaveBeenCalled();
    });

    it('two concurrent sweeps publish a pending row exactly once', async () => {
        let release!: () => void;
        publish.mockImplementation(() => new Promise<void>(resolve => (release = resolve)));
        await insertPending();

        const first = makeProcessor().processPendingBatch();
        await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
        await makeProcessor().processPendingBatch();
        release();
        await first;

        expect(publish).toHaveBeenCalledTimes(1);
    });

    it('a requeue issued while a sweep is dead-lettering the row does not clobber it, and works afterwards', async () => {
        let rejectPublish!: (error: Error) => void;
        publish.mockImplementation(
            () => new Promise<void>((_, reject) => (rejectPublish = reject)),
        );
        const entry = await insertPending({
            retryCount: 9,
            firstFailedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        });
        const recovery = new IntegrationOutboxRecoveryService(dataSource, {} as never, {} as never);
        const status = async (): Promise<unknown> =>
            (
                await dataSource
                    .getRepository(IntegrationOutboxEntry)
                    .findOneByOrFail({ id: entry.id })
            ).status;

        const sweep = makeProcessor().processPendingBatch();
        await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
        expect(await recovery.requeueFailed([entry.id])).toBe(0);
        rejectPublish(new Error('broker down'));
        await sweep;

        expect(await status()).toBe('failed');
        expect(await recovery.requeueFailed([entry.id])).toBe(1);
        expect(await status()).toBe('pending');
    });
});
