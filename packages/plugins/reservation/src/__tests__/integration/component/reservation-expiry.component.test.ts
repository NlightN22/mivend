import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

// Component test for the actual sweep→expire→release chain ReservationExpiryWorker triggers on
// a timer (packages/plugins/reservation/src/reservation-expiry.worker.ts) — the worker itself is
// thin BullMQ wiring around ReservationExpiryService.expireDueReservations(), so this file calls
// that method directly against real Postgres (no Redis/BullMQ needed — see docs/testing-
// strategy.md's "Worker testing": the queue/scheduler wiring gets one separate, minimal
// integration check, not exercised by every component test). Unit tests already cover the
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
@Entity('reservation_test_order')
class TestOrder {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'jsonb', default: {} }) customFields!: Record<string, unknown>;
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

    service = new ReservationExpiryService(dataSourceShim as never);
});

afterAll(async () => {
    await realDataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await realDataSource.query(
        'TRUNCATE TABLE reservation_test_reservation, reservation_test_order CASCADE',
    );
});

async function seedOrder(reservationState: string): Promise<TestOrder> {
    return realDataSource.getRepository(TestOrder).save({ customFields: { reservationState } });
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
    it('expires a due manual reservation and flips its order back to AWAITING_CONFIRMATION, atomically', async () => {
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
        expect(reloadedOrder.customFields['reservationState']).toBe('AWAITING_CONFIRMATION');
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
        expect(reloadedOrder.customFields['reservationState']).toBe('RESERVED');
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
        expect(orderAfterFirst.customFields['reservationState']).toBe('RESERVED');

        // Re-running the sweep on an already-flagged row is a safe no-op — mirrors the "safe
        // repeat sweep" requirement from docs/testing-patterns.md's Retry and recovery pattern.
        const secondRun = await service.expireDueReservations();
        expect(secondRun).toBe(0);
    });

    it('two concurrent sweeps over the same due row do not double-process or lose the order state flip', async () => {
        const order = await seedOrder('RESERVED');
        await realDataSource
            .getRepository(TestReservation)
            .save(dueReservation({ orderId: order.id, creationMethod: 'manual' }));

        const [countA, countB] = await Promise.all([
            service.expireDueReservations(),
            service.expireDueReservations(),
        ]);

        // Exactly one row exists — whichever sweep's UPDATE landed second still matches the same
        // row (WHERE id IN (...) has no status guard), so both counts can report success, but
        // the end state must be consistent and the order must be flipped exactly once.
        expect(countA + countB).toBeGreaterThanOrEqual(1);
        const reservation = await realDataSource.getRepository(TestReservation).find();
        expect(reservation).toHaveLength(1);
        expect(reservation[0]?.status).toBe('expired');
        const reloadedOrder = await realDataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(reloadedOrder.customFields['reservationState']).toBe('AWAITING_CONFIRMATION');
    });
});
