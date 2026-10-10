import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, EntityManager, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { Reservation } from '../../../entities/reservation.entity';
import { ReservationExpiryService } from '../../../reservation-expiry.service';

// Component test for the actual sweep→expire→release chain the reservation-expiry ScheduledTask
// triggers on a timer (packages/plugins/reservation/src/reservation-expiry.scheduled-task.ts) —
// the task itself is thin Vendure ScheduledTask wiring around
// ReservationExpiryService.expireDueReservations(), so this file calls that method directly
// against real Postgres (no scheduler wiring needed — see docs/testing-strategy.md's "Worker
// testing": the scheduler wiring gets one separate, minimal integration check, not exercised by
// every component test). Unit tests already cover the
// manual/auto-trust-rule/auto-prepaid/already-flagged branching with mocks
// (reservation-expiry.service.test.ts) — this file only proves the real-DB transaction and
// concurrency behavior, which mocks can't.
//
// Unlike ReservationService (see reserve-order.concurrency.test.ts), ReservationExpiryService
// intentionally takes a raw DataSource, not a TransactionalConnection (documented in that file:
// it runs outside any HTTP request, same pattern as SyncService.processOutbox) — so there is no
// connectionShim seam to substitute test entities through. It also calls
// `manager.getRepository(Reservation)` / `manager.getRepository(Order)` using the *real* Vendure
// entity classes directly; those need a bootstrap-time EntityIdStrategy Order in particular has
// far too many relations (customer, channels, shipping, etc.) to isolate in a standalone
// DataSource. Instead of changing the service (an intentional, documented design — not something
// to alter just for testability) or bootstrapping full Vendure, this file passes the real
// ReservationExpiryService a `DataSource`-shaped object whose `.transaction()` wraps the real
// transaction and hands the service an EntityManager proxy that redirects
// `getRepository(Reservation|Order)` to hand-rolled tables mirroring production schema — the same
// substitution idea `reserve-order.concurrency.test.ts`'s connectionShim uses, just applied at
// the DataSource/EntityManager boundary instead of TransactionalConnection.

// Embedded type (flattened columns), not jsonb — mirrors Vendure's own CustomOrderFields
// storage, needed for the REJECTED-deadline query's `where: { customFields: { ... } }` below.
class TestOrderCustomFields {
    @Column({ type: 'varchar', nullable: true }) reservationState!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpStatus!: string | null;
    @Column({ type: 'timestamp', nullable: true }) erpStatusAt!: Date | null;
}

@Entity('reservation_test_order')
class TestOrder {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column(() => TestOrderCustomFields) customFields!: TestOrderCustomFields;
}

@Index('idx_reservation_expiry_test_active_line_location', ['orderLineId', 'stockLocationId'], {
    unique: true,
    where: `"status" = 'active'`,
})
@Entity('reservation_test_reservation')
class TestReservation {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar' }) orderLineId!: string;
    @Column({ type: 'varchar' }) productVariantId!: string;
    @Column({ type: 'varchar' }) stockLocationId!: string;
    @Column({ type: 'int' }) quantity!: number;
    @Column({ type: 'varchar' }) status!: string;
    @Column({ type: 'timestamp' }) reservedAt!: Date;
    @Column({ type: 'timestamp' }) expiresAt!: Date;
    @Column({ type: 'timestamp', nullable: true }) releasedAt!: Date | null;
    @Column({ type: 'int', default: 1 }) reservationGeneration!: number;
    @Column({ type: 'varchar' }) creationMethod!: string;
    @Column({ type: 'varchar', nullable: true }) confirmedByAdministratorId!: string | null;
    @Column({ type: 'timestamp', nullable: true }) interventionFlaggedAt!: Date | null;
    @Column({ type: 'varchar' }) erpOperationId!: string;
    @Column({ type: 'varchar', nullable: true }) erpReleaseOperationId!: string | null;
    @Column({ type: 'timestamp', nullable: true }) erpConfirmedAt!: Date | null;
}

let realDataSource: DataSource;
let service: ReservationExpiryService;
let notificationServiceShim: { create: ReturnType<typeof vi.fn> };
let eventBusShim: { publish: ReturnType<typeof vi.fn> };
// The real cancel flow has its own lock/Postgres tests (order-cancellation.concurrency.test.ts);
// here it is a seam that reports the outcome the sweep must react to.
let cancellationShim: { cancel: ReturnType<typeof vi.fn> };
const NOT_CANCELLABLE_PAID = { kind: 'not-cancellable', reason: 'paid' } as const;

const { schema, extra } = testSchemaOptions('reservation_expiry_component');

function wrapManager(manager: EntityManager): EntityManager {
    return new Proxy(manager, {
        get(target, prop, receiver) {
            if (prop === 'getRepository') {
                return (entity: unknown) => {
                    if (entity === Reservation) return target.getRepository(TestReservation);
                    if (entity === Order) return target.getRepository(TestOrder);
                    return target.getRepository(entity as never);
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });
}

beforeAll(async () => {
    await createTestSchema(schema);
    realDataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder, TestReservation],
        synchronize: true,
    });
    await realDataSource.initialize();

    const dataSourceShim = {
        transaction: (work: (manager: EntityManager) => Promise<unknown>) =>
            realDataSource.transaction(manager => work(wrapManager(manager))),
    };

    // RequestContextService/NotificationService/EventBus are covered by their own plugins'
    // tests — this file is only about the real-Postgres transaction/concurrency behavior.
    const requestContextServiceShim = { create: async () => ({}) };
    notificationServiceShim = { create: vi.fn(async () => ({})) };
    eventBusShim = { publish: vi.fn() };
    cancellationShim = { cancel: vi.fn() };

    service = new ReservationExpiryService(
        dataSourceShim as never,
        requestContextServiceShim as never,
        notificationServiceShim as never,
        eventBusShim as never,
        cancellationShim as never,
    );
});

afterAll(async () => {
    await realDataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await realDataSource.query(
        'TRUNCATE TABLE reservation_test_reservation, reservation_test_order CASCADE',
    );
    notificationServiceShim.create.mockClear();
    eventBusShim.publish.mockClear();
    cancellationShim.cancel.mockReset();
    cancellationShim.cancel.mockResolvedValue(NOT_CANCELLABLE_PAID);
});

async function seedOrder(
    reservationState: string,
    extra: Partial<TestOrderCustomFields> = {},
): Promise<TestOrder> {
    return realDataSource
        .getRepository(TestOrder)
        .save({ customFields: { reservationState, ...extra } });
}

function dueReservation(overrides: Partial<TestReservation>): Partial<TestReservation> {
    return {
        orderLineId: crypto.randomUUID(),
        productVariantId: 'variant-1',
        stockLocationId: 'location-1',
        quantity: 1,
        status: 'active',
        reservedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 1_000),
        reservationGeneration: 1,
        confirmedByAdministratorId: null,
        interventionFlaggedAt: null,
        erpOperationId: crypto.randomUUID(),
        erpReleaseOperationId: null,
        erpConfirmedAt: null,
        ...overrides,
    };
}

describe('ReservationExpiryService.expireDueReservations (component, real Postgres)', () => {
    it('cancels a due non-prepaid order through the cancellation service, at the deadline mode', async () => {
        cancellationShim.cancel.mockResolvedValue({ kind: 'cancelled', eventSent: false });
        const order = await seedOrder('RESERVED');
        await realDataSource
            .getRepository(TestReservation)
            .save(dueReservation({ orderId: order.id, creationMethod: 'manual' }));

        const count = await service.expireDueReservations();

        expect(count).toBe(1);
        expect(cancellationShim.cancel).toHaveBeenCalledWith(
            expect.anything(),
            order.id,
            'reserve-expired',
            { requestRegistered: false },
        );
        const reloadedOrder = await realDataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(reloadedOrder.customFields.reservationState).toBe('RESERVED');
    });

    it('leaves a registered order to the ERP and flags it for staff only after the grace period', async () => {
        cancellationShim.cancel.mockResolvedValue({ kind: 'left-to-erp' });
        const order = await seedOrder('RESERVED');
        await realDataSource.getRepository(TestReservation).save(
            dueReservation({
                orderId: order.id,
                creationMethod: 'manual',
                expiresAt: new Date(Date.now() - 60_000),
            }),
        );

        expect(await service.expireDueReservations()).toBe(0);
        expect(notificationServiceShim.create).not.toHaveBeenCalled();

        await realDataSource
            .getRepository(TestReservation)
            .update(
                { status: 'active' },
                { expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
            );
        await service.expireDueReservations();
        expect(notificationServiceShim.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ sourceType: 'reservation-erp-owned' }),
        );
        const reservation = await realDataSource.getRepository(TestReservation).find();
        expect(reservation[0]?.status).toBe('active');
        expect(reservation[0]?.interventionFlaggedAt).not.toBeNull();

        cancellationShim.cancel.mockClear();
        await service.expireDueReservations();
        expect(cancellationShim.cancel).not.toHaveBeenCalled();
    });

    it('falls back to the confirmation queue when the order cannot be cancelled automatically: expires and flips the state, atomically', async () => {
        const order = await seedOrder('RESERVED');
        await realDataSource
            .getRepository(TestReservation)
            .save(dueReservation({ orderId: order.id, creationMethod: 'manual' }));

        const expiredCount = await service.expireDueReservations();

        expect(expiredCount).toBe(1);
        const reservation = await realDataSource.getRepository(TestReservation).find();
        expect(reservation[0]?.status).toBe('expired');
        const reloadedOrder = await realDataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(reloadedOrder.customFields.reservationState).toBe('AWAITING_CONFIRMATION');
    });

    it('leaves a not-yet-due reservation and its order untouched', async () => {
        const order = await seedOrder('RESERVED');
        await realDataSource.getRepository(TestReservation).save(
            dueReservation({
                orderId: order.id,
                creationMethod: 'manual',
                expiresAt: new Date(Date.now() + 60_000),
            }),
        );

        const expiredCount = await service.expireDueReservations();

        expect(expiredCount).toBe(0);
        const reservation = await realDataSource.getRepository(TestReservation).find();
        expect(reservation[0]?.status).toBe('active');
        const reloadedOrder = await realDataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(reloadedOrder.customFields.reservationState).toBe('RESERVED');
    });

    it('never auto-releases an auto-prepaid reservation — flags it once for manual intervention', async () => {
        const order = await seedOrder('RESERVED');
        await realDataSource
            .getRepository(TestReservation)
            .save(dueReservation({ orderId: order.id, creationMethod: 'auto-prepaid' }));

        const firstRun = await service.expireDueReservations();
        expect(firstRun).toBe(1);

        const afterFirst = await realDataSource.getRepository(TestReservation).find();
        expect(afterFirst[0]?.status).toBe('active');
        expect(afterFirst[0]?.interventionFlaggedAt).not.toBeNull();
        const orderAfterFirst = await realDataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(orderAfterFirst.customFields.reservationState).toBe('RESERVED');

        // Re-running the sweep on an already-flagged row is a safe no-op — mirrors the "safe
        // repeat sweep" requirement from docs/testing-patterns.md's Retry and recovery pattern.
        const secondRun = await service.expireDueReservations();
        expect(secondRun).toBe(0);
    });

    it('two concurrent sweeps over the same due row end in one consistent state', async () => {
        const order = await seedOrder('RESERVED');
        await realDataSource
            .getRepository(TestReservation)
            .save(dueReservation({ orderId: order.id, creationMethod: 'manual' }));

        await Promise.all([service.expireDueReservations(), service.expireDueReservations()]);

        // The cancel step runs outside the sweep transaction and is idempotent under the order
        // lock, so both sweeps may reach it; the end state is what must be single.
        const reservation = await realDataSource.getRepository(TestReservation).find();
        expect(reservation).toHaveLength(1);
        expect(reservation[0]?.status).toBe('expired');
        const reloadedOrder = await realDataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(reloadedOrder.customFields.reservationState).toBe('AWAITING_CONFIRMATION');
    });

    // #209: this write used to spread a stale customFields snapshot, erasing a concurrent
    // writer's erpStatus key — both writers' keys must survive.
    it('survives a concurrent erpStatus write touching a different customFields key on the same order', async () => {
        const order = await seedOrder('RESERVED', { erpStatus: 'PENDING' });
        await realDataSource
            .getRepository(TestReservation)
            .save(dueReservation({ orderId: order.id, creationMethod: 'manual' }));

        await Promise.all([
            service.expireDueReservations(),
            realDataSource
                .getRepository(TestOrder)
                .update(order.id, { customFields: { erpStatus: 'CONFIRMED' } }),
        ]);

        const reloadedOrder = await realDataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(reloadedOrder.customFields.reservationState).toBe('AWAITING_CONFIRMATION');
        expect(reloadedOrder.customFields.erpStatus).toBe('CONFIRMED');
    });

    // issue #204: the ERP-rejection timeout is independent of the reservation's own TTL —
    // this reservation isn't due by expiresAt at all, only by its order's REJECTED deadline.
    describe('REJECTED-order timeout (issue #204)', () => {
        async function seedRejectedOrder(rejectedDaysAgo: number): Promise<TestOrder> {
            return seedOrder('RESERVED', {
                erpStatus: 'REJECTED',
                erpStatusAt: new Date(Date.now() - rejectedDaysAgo * 24 * 60 * 60 * 1000),
            });
        }

        it('notifies and releases a reservation once its order has been REJECTED past the deadline', async () => {
            const order = await seedRejectedOrder(8);
            await realDataSource.getRepository(TestReservation).save(
                dueReservation({
                    orderId: order.id,
                    creationMethod: 'manual',
                    expiresAt: new Date(Date.now() + 60_000),
                }),
            );

            const count = await service.expireDueReservations();

            expect(count).toBe(1);
            expect(notificationServiceShim.create).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ sourceType: 'reservation-rejected-release' }),
            );
            expect(eventBusShim.publish).toHaveBeenCalledTimes(1);
            const reservation = await realDataSource.getRepository(TestReservation).find();
            expect(reservation[0]?.status).toBe('released');
            expect(reservation[0]?.releasedAt).not.toBeNull();
            expect(reservation[0]?.erpReleaseOperationId).not.toBeNull();
            const reloadedOrder = await realDataSource
                .getRepository(TestOrder)
                .findOneByOrFail({ id: order.id });
            expect(reloadedOrder.customFields.reservationState).toBe('RELEASED');
        });

        it('leaves a REJECTED order alone before its own deadline', async () => {
            const order = await seedRejectedOrder(1);
            await realDataSource.getRepository(TestReservation).save(
                dueReservation({
                    orderId: order.id,
                    creationMethod: 'manual',
                    expiresAt: new Date(Date.now() + 60_000),
                }),
            );

            const count = await service.expireDueReservations();

            expect(count).toBe(0);
            const reservation = await realDataSource.getRepository(TestReservation).find();
            expect(reservation[0]?.status).toBe('active');
        });

        it('a reservation that is both TTL-due and REJECTED-due is released, never double-processed', async () => {
            const order = await seedRejectedOrder(8);
            await realDataSource
                .getRepository(TestReservation)
                .save(dueReservation({ orderId: order.id, creationMethod: 'manual' }));

            const count = await service.expireDueReservations();

            expect(count).toBe(1);
            const reservation = await realDataSource.getRepository(TestReservation).find();
            expect(reservation).toHaveLength(1);
            expect(reservation[0]?.status).toBe('released');
        });

        it('two concurrent sweeps over the same REJECTED-due row release it exactly once, with exactly one notification and one event', async () => {
            const order = await seedRejectedOrder(8);
            await realDataSource.getRepository(TestReservation).save(
                dueReservation({
                    orderId: order.id,
                    creationMethod: 'manual',
                    expiresAt: new Date(Date.now() + 60_000),
                }),
            );

            const [countA, countB] = await Promise.all([
                service.expireDueReservations(),
                service.expireDueReservations(),
            ]);

            // SKIP LOCKED means the loser sees no due rows at all, so its NotificationService.create
            // and EventBus.publish calls below must never fire for this row — not just the end state.
            expect([countA, countB].sort()).toEqual([0, 1]);
            const reservation = await realDataSource.getRepository(TestReservation).find();
            expect(reservation).toHaveLength(1);
            expect(reservation[0]?.status).toBe('released');
            const reloadedOrder = await realDataSource
                .getRepository(TestOrder)
                .findOneByOrFail({ id: order.id });
            expect(reloadedOrder.customFields.reservationState).toBe('RELEASED');
            expect(notificationServiceShim.create).toHaveBeenCalledTimes(1);
            expect(notificationServiceShim.create).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ sourceType: 'reservation-rejected-release' }),
            );
            expect(eventBusShim.publish).toHaveBeenCalledTimes(1);
        });
    });
});
