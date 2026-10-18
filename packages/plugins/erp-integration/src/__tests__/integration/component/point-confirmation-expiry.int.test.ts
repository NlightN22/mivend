import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { Repository } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import type { CancelOptions } from '@mivend/plugin-reservation';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { HELD_SKIP_REASON } from '../../../order-checks/order-send-hold.service';
import { PointConfirmationExpiryService } from '../../../order-checks/point-confirmation-expiry.service';
import { COURIER_POINT_UNCONFIRMED_SKIP_REASON } from '../../../order-submitted.builder';

// Real Postgres: waiting orders past the deadline are cancelled or flagged once; others are untouched.
@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar', default: 'ArrangingPayment' }) state!: string;
    @Column({ name: 'orderPlacedAt', type: 'timestamp', nullable: true })
    orderPlacedAt!: Date | null;
    @Column({ name: 'customFieldsReservationdays', type: 'int', nullable: true })
    reservationDays!: number | null;
}

@Entity('notification')
class TestNotification {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) sourceType!: string;
    @Column({ type: 'varchar' }) sourceId!: string;
}

const { schema, extra } = testSchemaOptions('erp_point_confirmation_expiry');
let dataSource: DataSource;
let service: PointConfirmationExpiryService;
const paidOrderIds = new Set<string>();
const ctx = {} as never;

const outbox = (): Repository<IntegrationOutboxEntry> =>
    dataSource.getRepository(IntegrationOutboxEntry);
let beforeLockedCheck: ((orderId: string) => Promise<void>) | undefined;
const cancel = vi.fn(
    async (_ctx: unknown, orderId: string, _reason: string, options?: CancelOptions) => {
        await beforeLockedCheck?.(orderId);
        if (options?.stillDue) {
            const order = await dataSource
                .getRepository(TestOrder)
                .findOneByOrFail({ id: Number(orderId) });
            if (!(await options.stillDue(ctx, order as never))) return { kind: 'reserve-not-due' };
        }
        if (paidOrderIds.has(orderId)) return { kind: 'not-cancellable', reason: 'paid' };
        await dataSource.getRepository(TestOrder).update(Number(orderId), { state: 'Cancelled' });
        return { kind: 'cancelled', eventSent: false };
    },
);
const notifications = {
    create: vi.fn(async (_ctx: unknown, input: Record<string, string>) =>
        dataSource.getRepository(TestNotification).save({
            sourceType: input.sourceType,
            sourceId: input.sourceId,
        }),
    ),
};

const waitingOrder = async (
    daysAgo: number,
    lastError = COURIER_POINT_UNCONFIRMED_SKIP_REASON,
    reservationDays: number | null = null,
): Promise<TestOrder> => {
    const order = await dataSource.getRepository(TestOrder).save({
        code: `ORD-${randomUUID().slice(0, 6)}`,
        orderPlacedAt: new Date(Date.now() - daysAgo * 86_400_000),
        reservationDays,
    } as TestOrder);
    await outbox().save(
        outbox().create({
            eventId: randomUUID(),
            eventType: 'order.confirmed',
            payload: { orderId: String(order.id), orderCode: order.code },
            status: 'skipped',
            lastError,
        }),
    );
    return order;
};

const stateOf = async (id: number): Promise<string> =>
    (await dataSource.getRepository(TestOrder).findOneByOrFail({ id })).state;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationOutboxEntry, TestOrder, TestNotification],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new PointConfirmationExpiryService(
        dataSource,
        { getRepository: () => dataSource.getRepository(TestOrder) } as never,
        { create: async () => ctx } as never,
        { cancel } as never,
        notifications as never,
        { defaultReservationDays: () => 3 } as never,
    );
});

afterEach(async () => {
    paidOrderIds.clear();
    beforeLockedCheck = undefined;
    cancel.mockClear();
    notifications.create.mockClear();
    await outbox().clear();
    await dataSource.query('TRUNCATE "order", notification RESTART IDENTITY');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('point-confirmation expiry', () => {
    it('cancels a past-deadline order and leaves a within-deadline one (own days win over the default)', async () => {
        const late = await waitingOrder(4);
        const fresh = await waitingOrder(2);
        const longer = await waitingOrder(4, COURIER_POINT_UNCONFIRMED_SKIP_REASON, 10);

        expect(await service.expireDue()).toBe(1);

        expect(await stateOf(late.id)).toBe('Cancelled');
        expect(await stateOf(fresh.id)).toBe('ArrangingPayment');
        expect(await stateOf(longer.id)).toBe('ArrangingPayment');
        expect(await service.expireDue()).toBe(0);
    });

    it('notifies once for an order that cannot be cancelled, across two sweeps and two at once', async () => {
        const paid = await waitingOrder(5);
        paidOrderIds.add(String(paid.id));

        await service.expireDue();
        await service.expireDue();
        await Promise.all([service.expireDue(), service.expireDue()]);

        expect(await stateOf(paid.id)).toBe('ArrangingPayment');
        expect(await dataSource.getRepository(TestNotification).count()).toBe(1);
    });

    it('leaves a send held for another reason untouched', async () => {
        const held = await waitingOrder(30, HELD_SKIP_REASON);

        expect(await service.expireDue()).toBe(0);

        expect(cancel).not.toHaveBeenCalled();
        expect(await stateOf(held.id)).toBe('ArrangingPayment');
    });

    it('does not cancel when the validity period is extended between the sweep read and the cancel', async () => {
        const order = await waitingOrder(4);
        beforeLockedCheck = async id => {
            await dataSource.getRepository(TestOrder).update(Number(id), { reservationDays: 10 });
        };

        await service.expireDue();

        expect(await stateOf(order.id)).toBe('ArrangingPayment');
        expect(await dataSource.getRepository(TestNotification).count()).toBe(0);
    });

    it('does not cancel when the point got confirmed between the sweep read and the cancel', async () => {
        const order = await waitingOrder(4);
        beforeLockedCheck = async () => {
            await outbox().update({ status: 'skipped' }, { status: 'published', lastError: null });
        };

        await service.expireDue();

        expect(await stateOf(order.id)).toBe('ArrangingPayment');
    });
});
