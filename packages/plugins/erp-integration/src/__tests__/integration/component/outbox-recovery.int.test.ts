import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxProcessorService } from '../../../integration-outbox-processor.service';
import { IntegrationOutboxRecoveryService } from '../../../integration-outbox-recovery.service';
import { IntegrationOutboxService } from '../../../integration-outbox.service';
import { OUTBOUND_EVENT_TYPES } from '../../../outbound-event-types';
import { outboundSend, outboundSkip } from '../../../outbound-gateway';
import type { OrderSubmittedPayload } from '../../../schemas/order-submitted.schema';
import type { OutboundBuildResult } from '../../../outbound-gateway';

// Recovery of the two non-success outbox states on real Postgres: requeue of `failed`, rebuild of
// `skipped`, including the concurrent-rebuild race (docs/concurrency.md).
let dataSource: DataSource;
let recovery: IntegrationOutboxRecoveryService;
const build = vi.fn<() => Promise<OutboundBuildResult>>();
const publish = vi.fn();
const ctx = {} as RequestContext;
const subject = { orderId: 'order-1', orderCode: 'ORD-1' };

const { schema, extra } = testSchemaOptions('erp_integration_outbox_recovery');
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
    recovery = new IntegrationOutboxRecoveryService(dataSource, new IntegrationOutboxService(), {
        build,
    } as never);
});

afterEach(async () => {
    await repo().clear();
    build.mockReset();
    publish.mockReset();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function insertRow(
    overrides: Partial<IntegrationOutboxEntry>,
): Promise<IntegrationOutboxEntry> {
    return repo().save(
        repo().create({
            eventId: randomUUID(),
            eventType: 'order.submitted',
            payload: subject,
            status: 'pending',
            retryCount: 0,
            ...overrides,
        }),
    );
}

describe('requeueFailed', () => {
    it('returns failed rows to pending with a fresh retry state, touching nothing else', async () => {
        const failed = await insertRow({
            status: 'failed',
            retryCount: 9,
            firstFailedAt: new Date(),
            lastError: 'broker down',
        });
        const published = await insertRow({ status: 'published' });

        const moved = await recovery.requeueFailed([failed.id, published.id]);

        expect(moved).toBe(1);
        const reloaded = await repo().findOneByOrFail({ id: failed.id });
        expect(reloaded).toMatchObject({ status: 'pending', retryCount: 0, firstFailedAt: null });
        expect((await repo().findOneByOrFail({ id: published.id })).status).toBe('published');
    });

    it('a requeued row is published by the next sweep exactly once', async () => {
        publish.mockResolvedValue(undefined);
        const failed = await insertRow({ status: 'failed' });
        await recovery.requeueFailed([failed.id]);

        const processor = new IntegrationOutboxProcessorService(dataSource, { publish } as never);
        await processor.processPendingBatch();
        await processor.processPendingBatch();

        expect(publish).toHaveBeenCalledTimes(1);
        expect((await repo().findOneByOrFail({ id: failed.id })).status).toBe('published');
    });
});

describe('rebuildSkipped', () => {
    it('queues the rebuilt event and resolves the skipped row', async () => {
        const skipped = await insertRow({ status: 'skipped', lastError: 'no organizationId' });
        build.mockResolvedValue(outboundSend([{ payload: { ...subject, rebuilt: true } }]));

        expect(await recovery.rebuildSkipped(ctx, skipped.id)).toBe('queued');

        expect((await repo().findOneByOrFail({ id: skipped.id })).status).toBe('resolved');
        const pending = await repo().find({ where: { status: 'pending' } });
        expect(pending).toHaveLength(1);
        expect(pending[0].payload).toMatchObject({ rebuilt: true });
    });

    it('stays skipped, with the new reason, when the cause is not fixed', async () => {
        const skipped = await insertRow({ status: 'skipped', lastError: 'old reason' });
        build.mockResolvedValue(outboundSkip('still no organizationId'));

        expect(await recovery.rebuildSkipped(ctx, skipped.id)).toBe('still-skipped');

        expect(await repo().findOneByOrFail({ id: skipped.id })).toMatchObject({
            status: 'skipped',
            lastError: 'still no organizationId',
        });
        expect(await repo().count()).toBe(1);
    });

    it('does not rebuild when the order was already sent by another row', async () => {
        const skipped = await insertRow({ status: 'skipped' });
        await insertRow({ status: 'published', payload: { ...subject, extra: 1 } });

        expect(await recovery.rebuildSkipped(ctx, skipped.id)).toBe('already-sent');

        expect(build).not.toHaveBeenCalled();
        expect((await repo().findOneByOrFail({ id: skipped.id })).status).toBe('resolved');
    });

    it('matches an already-sent event by the registry subject key against the real payload shape', async () => {
        const subjectKey: keyof OrderSubmittedPayload =
            OUTBOUND_EVENT_TYPES['order.submitted'].subjectKey;
        const realPayload: OrderSubmittedPayload = {
            eventId: randomUUID(),
            orderId: 'order-1',
            orderCode: 'ORD-1',
            orderUuid: randomUUID(),
            orderNumber: 'ORD-1',
            organizationId: 'org-1',
            contractId: 'ctr-1',
            customerId: 'cp-1',
            warehouseId: 'wh-1',
            lines: [{ productId: 'p-1', quantity: 2, priceTypeId: null, lineUuid: randomUUID() }],
            submittedAt: new Date().toISOString(),
            totalWithTax: 100,
            currencyCode: 'USD',
        };
        expect(realPayload[subjectKey]).toBe(subject.orderId);
        const skipped = await insertRow({ status: 'skipped' });
        await insertRow({
            status: 'published',
            payload: realPayload as unknown as Record<string, unknown>,
        });

        expect(await recovery.rebuildSkipped(ctx, skipped.id)).toBe('already-sent');
    });

    it("does not treat another order's event as already sent", async () => {
        const skipped = await insertRow({ status: 'skipped' });
        await insertRow({
            status: 'published',
            payload: { orderId: 'order-2', orderCode: 'ORD-2' },
        });
        build.mockResolvedValue(outboundSend([{ payload: { orderId: 'order-1' } }]));

        expect(await recovery.rebuildSkipped(ctx, skipped.id)).toBe('queued');
    });

    it('records a builder failure on the skipped row and rethrows it', async () => {
        const skipped = await insertRow({ status: 'skipped', lastError: 'old reason' });
        build.mockRejectedValue(new Error('order lookup failed'));

        await expect(recovery.rebuildSkipped(ctx, skipped.id)).rejects.toThrow(
            'order lookup failed',
        );

        expect(await repo().findOneByOrFail({ id: skipped.id })).toMatchObject({
            status: 'skipped',
            lastError: 'rebuild failed: order lookup failed',
        });
    });

    it('rejects a row that is not skipped', async () => {
        const pending = await insertRow({ status: 'pending' });

        await expect(recovery.rebuildSkipped(ctx, pending.id)).rejects.toThrow('not a skipped row');
    });

    it('two concurrent rebuilds of one skipped row queue the event exactly once', async () => {
        const skipped = await insertRow({ status: 'skipped' });
        build.mockImplementation(async () =>
            outboundSend([{ payload: { ...subject, rebuilt: true } }]),
        );

        const results = await Promise.allSettled([
            recovery.rebuildSkipped(ctx, skipped.id),
            recovery.rebuildSkipped(ctx, skipped.id),
        ]);

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(await repo().count({ where: { status: 'pending' } })).toBe(1);
    });
});
