import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import { CheckPolicyChangedEvent } from '@mivend/plugin-checks';
import { OrderDeliveryEditedEvent, OrderStaffConfirmedEvent } from '@mivend/plugin-reservation';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    createTestConnection,
} from 'shared';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxRecoveryService } from '../../../integration-outbox-recovery.service';
import { IntegrationOutboxService } from '../../../integration-outbox.service';
import { HeldSendRedriveService } from '../../../order-checks/held-send-redrive.service';
import { HELD_SKIP_REASON } from '../../../order-checks/order-send-hold.service';
import { COURIER_WITHOUT_POINT_SKIP_REASON } from '../../../order-submitted.builder';
import { outboundSend, outboundSkip } from '../../../outbound-gateway';
import type { OutboundBuildResult } from '../../../outbound-gateway';

// Real Postgres: a send held at pre-send-to-erp leaves a skipped row that a release must re-drive.
let dataSource: DataSource;
const build = vi.fn<() => Promise<OutboundBuildResult>>();
let service: HeldSendRedriveService;
const handlers = new Map<string, (event: unknown) => Promise<void>>();
const ctx = {} as RequestContext;

const { schema, extra } = testSchemaOptions('erp_held_send_redrive');
const repo = (): Repository<IntegrationOutboxEntry> =>
    dataSource.getRepository(IntegrationOutboxEntry);

const heldRow = (orderId: string, lastError = HELD_SKIP_REASON) =>
    repo().save(
        repo().create({
            eventId: randomUUID(),
            eventType: 'order.confirmed',
            payload: { orderId, orderCode: `ORD-${orderId}` },
            status: 'skipped',
            lastError,
        }),
    );

const statusOf = async (id: number): Promise<string> =>
    (await repo().findOneByOrFail({ id })).status;

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
    const recovery = new IntegrationOutboxRecoveryService(
        createTestConnection(dataSource),
        new IntegrationOutboxService(createTestConnection(dataSource)),
        { build } as never,
    );
    const eventBus = {
        ofType: (cls: { name: string }) => ({
            subscribe: (fn: (event: unknown) => Promise<void>) => handlers.set(cls.name, fn),
        }),
    };
    service = new HeldSendRedriveService(
        eventBus as never,
        createTestConnection(dataSource),
        recovery,
        { create: async () => ctx } as never,
        { instanceType: 'central' } as never,
    );
    service.onApplicationBootstrap();
});

beforeEach(() => {
    build.mockResolvedValue(outboundSend([{ payload: { orderId: 'sent' } }]));
});

afterEach(async () => {
    await repo().clear();
    build.mockReset();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const policyChange = (stage: string, consequence: 'hold' | 'warn', enabled = true) =>
    handlers.get('CheckPolicyChangedEvent')!(
        new CheckPolicyChangedEvent(ctx, 'erp.organization-stock', stage, { consequence, enabled }),
    );

describe('held send re-drive', () => {
    it('a staff confirmation rebuilds and sends that order only', async () => {
        const mine = await heldRow('1');
        const other = await heldRow('2');

        await handlers.get('OrderStaffConfirmedEvent')!(new OrderStaffConfirmedEvent(ctx, '1'));

        expect(await statusOf(mine.id)).toBe('resolved');
        expect(await statusOf(other.id)).toBe('skipped');
        expect(await repo().count({ where: { status: 'pending' } })).toBe(1);
    });

    it('a policy that stops holding at pre-send-to-erp re-drives every held send', async () => {
        const a = await heldRow('1');
        const b = await heldRow('2');

        await policyChange('pre-send-to-erp', 'hold');

        expect(await statusOf(a.id)).toBe('resolved');
        expect(await statusOf(b.id)).toBe('resolved');
        expect(await repo().count({ where: { status: 'pending' } })).toBe(2);
    });

    it('stays skipped while another policy still holds the order', async () => {
        const a = await heldRow('1');
        build.mockResolvedValue(outboundSkip(HELD_SKIP_REASON));

        await policyChange('pre-send-to-erp', 'hold');

        expect(await statusOf(a.id)).toBe('skipped');
        expect(await repo().count({ where: { status: 'pending' } })).toBe(0);
    });

    it('the sweep sends a held row whose release event was never seen (cause gone on data)', async () => {
        const a = await heldRow('1');

        await service.sweep();

        expect(await statusOf(a.id)).toBe('resolved');
    });

    it('the sweep retries a failed rebuild with a growing delay until it succeeds', async () => {
        const a = await heldRow('1');
        build.mockRejectedValueOnce(new Error('db blip'));

        await service.sweep();
        expect((await repo().findOneByOrFail({ id: a.id })).lastError).toMatch(/rebuild failed/);

        await service.sweep();
        expect(await statusOf(a.id)).toBe('skipped');

        await dataSource.query(
            `UPDATE integration_outbox SET created_at = now() - interval '3 days',
                    last_error_at = now() - interval '2 days' WHERE id = $1`,
            [a.id],
        );
        await service.sweep();
        expect(await statusOf(a.id)).toBe('resolved');
    });

    it('the sweep gives up on a failed rebuild older than 7 days', async () => {
        const a = await heldRow('1', 'rebuild failed: gone');
        await dataSource.query(
            `UPDATE integration_outbox SET created_at = now() - interval '8 days',
                    last_error_at = now() - interval '2 days' WHERE id = $1`,
            [a.id],
        );

        await service.sweep();

        expect(await statusOf(a.id)).toBe('skipped');
        expect(build).not.toHaveBeenCalled();
    });

    it('two sweeps at once send once and log no error for the lost race', async () => {
        const a = await heldRow('1');
        const logged = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);

        await Promise.all([service.sweep(), service.sweep()]);

        expect(await statusOf(a.id)).toBe('resolved');
        expect(await repo().count({ where: { status: 'pending' } })).toBe(1);
        expect(logged).not.toHaveBeenCalled();
        logged.mockRestore();
    });

    it('the sweep leaves a send that is still held skipped and sends nothing', async () => {
        const a = await heldRow('1');
        build.mockResolvedValue(outboundSkip(HELD_SKIP_REASON));

        expect(await service.sweep()).toBe(0);

        expect(await statusOf(a.id)).toBe('skipped');
    });

    it('ignores other stages, policies that were not holding, and rows skipped for other reasons', async () => {
        const held = await heldRow('1');
        const other = await heldRow('2', 'order has no lines');

        await policyChange('pre-reserve', 'hold');
        await policyChange('pre-send-to-erp', 'warn');
        await handlers.get('OrderStaffConfirmedEvent')!(new OrderStaffConfirmedEvent(ctx, '2'));

        expect(await statusOf(held.id)).toBe('skipped');
        expect(await statusOf(other.id)).toBe('skipped');
        expect(build).not.toHaveBeenCalled();
    });

    it('the sweep picks up a send skipped for a courier order without a point', async () => {
        const a = await heldRow('1', COURIER_WITHOUT_POINT_SKIP_REASON);

        await service.sweep();

        expect(await statusOf(a.id)).toBe('resolved');
        expect(await repo().count({ where: { status: 'pending' } })).toBe(1);
    });

    it('delivery edit then staff re-confirm: stays skipped while the point is missing, sent after the re-confirm', async () => {
        const a = await heldRow('1', COURIER_WITHOUT_POINT_SKIP_REASON);
        build.mockResolvedValue(outboundSkip(COURIER_WITHOUT_POINT_SKIP_REASON));

        await handlers.get('OrderDeliveryEditedEvent')!(new OrderDeliveryEditedEvent(ctx, '1'));
        expect(await statusOf(a.id)).toBe('skipped');

        build.mockResolvedValue(outboundSend([{ payload: { orderId: '1' } }]));
        await handlers.get('OrderStaffConfirmedEvent')!(new OrderStaffConfirmedEvent(ctx, '1'));

        expect(await statusOf(a.id)).toBe('resolved');
        expect(await repo().count({ where: { status: 'pending' } })).toBe(1);
    });
});
