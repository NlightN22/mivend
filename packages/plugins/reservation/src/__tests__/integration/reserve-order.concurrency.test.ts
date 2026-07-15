import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    EntityManager,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationService } from '../../reservation.service';
import { InsufficientStockError } from '../../reservation-errors';

// Same constraint as approval-workflow's integration tests (VendureEntity needs a bootstrap-time
// EntityIdStrategy for its primary column) — hand-rolled tables matching production schema,
// against real Postgres, no DB mocking. entityMap below maps the real Vendure entity classes the
// service imports (Order, Reservation, StockLevel, StockLocation) to these test tables, so
// ReservationService itself is exercised unmodified.

@Entity('reservation_test_order')
class TestOrder {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'jsonb', default: {} }) customFields!: Record<string, unknown>;
    @OneToMany(() => TestOrderLine, line => line.order) lines!: TestOrderLine[];
}

@Entity('reservation_test_product_variant')
class TestProductVariant {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'jsonb', default: {} }) customFields!: Record<string, unknown>;
}

@Entity('reservation_test_order_line')
class TestOrderLine {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) productVariantId!: string;
    @Column({ type: 'int' }) quantity!: number;
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar', nullable: true }) productVariantEntityId!: string | null;
    @ManyToOne(() => TestOrder, order => order.lines)
    @JoinColumn({ name: 'orderId' })
    order!: TestOrder;
    @ManyToOne(() => TestProductVariant)
    @JoinColumn({ name: 'productVariantEntityId' })
    productVariant!: TestProductVariant | null;
}

@Entity('reservation_test_stock_location')
class TestStockLocation {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar', default: 'Default Stock Location' }) name!: string;
}

@Entity('reservation_test_stock_level')
class TestStockLevel {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) productVariantId!: string;
    @Column({ type: 'varchar' }) stockLocationId!: string;
    @Column({ type: 'int' }) stockOnHand!: number;
    @Column({ type: 'int', default: 0 }) stockAllocated!: number;
}

@Index('idx_reservation_test_active_line_location', ['orderLineId', 'stockLocationId'], {
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

let dataSource: DataSource;
let service: ReservationService;

const entityMap = {
    Order: TestOrder,
    Reservation: TestReservation,
    StockLevel: TestStockLevel,
    StockLocation: TestStockLocation,
} as const;

const mockCtx = { activeUserId: 'user-1' } as unknown as RequestContext;

function withManager(ctx: RequestContext, manager: EntityManager): RequestContext {
    return { ...ctx, __manager: manager } as unknown as RequestContext;
}

beforeAll(async () => {
    dataSource = new DataSource({
        type: 'postgres',
        host: process.env['TEST_DB_HOST'] ?? 'localhost',
        port: Number(process.env['TEST_DB_PORT'] ?? 5432),
        username: process.env['TEST_DB_USER'] ?? 'postgres',
        password: process.env['TEST_DB_PASSWORD'] ?? 'postgres',
        database: process.env['TEST_DB_NAME'] ?? 'mivend_test',
        entities: [
            TestOrder,
            TestOrderLine,
            TestProductVariant,
            TestStockLocation,
            TestStockLevel,
            TestReservation,
        ],
        synchronize: true,
        dropSchema: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: (ctx: RequestContext, entity: { name: string }) => {
            const manager = (ctx as unknown as { __manager?: EntityManager }).__manager;
            const target = entityMap[entity.name as keyof typeof entityMap];
            return manager ? manager.getRepository(target) : dataSource.getRepository(target);
        },
        withTransaction: async (
            ctx: RequestContext,
            work: (txCtx: RequestContext) => Promise<unknown>,
        ) => dataSource.transaction(manager => work(withManager(ctx, manager))),
    } as unknown as TransactionalConnection;

    const eventBus = { publish: () => undefined } as unknown as EventBus;

    service = new ReservationService(connectionShim, eventBus);
});

afterAll(async () => {
    await dataSource.destroy();
});

// ReservationService caches the default StockLocation id for the lifetime of the singleton
// (correct in production, where exactly one StockLocation ever exists) — so the test suite
// must create it once, not per-test, to match that assumption.
let location: TestStockLocation;

beforeAll(async () => {
    location = await dataSource.getRepository(TestStockLocation).save({});
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE TABLE reservation_test_reservation, reservation_test_order_line, ' +
            'reservation_test_order, reservation_test_stock_level CASCADE',
    );
});

describe('ReservationService.reserveOrder (integration, real Postgres, concurrency)', () => {
    it('exactly one of two concurrent reserveOrder() calls succeeds when combined demand exceeds ATP', async () => {
        await dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-1',
            stockLocationId: location.id,
            stockOnHand: 5,
            stockAllocated: 0,
        });

        const orderA = await dataSource.getRepository(TestOrder).save({ customFields: {} });
        await dataSource
            .getRepository(TestOrderLine)
            .save({ orderId: orderA.id, productVariantId: 'variant-1', quantity: 3 });

        const orderB = await dataSource.getRepository(TestOrder).save({ customFields: {} });
        await dataSource
            .getRepository(TestOrderLine)
            .save({ orderId: orderB.id, productVariantId: 'variant-1', quantity: 3 });

        const results = await Promise.allSettled([
            service.reserveOrder(mockCtx, orderA.id, 7, 'manual'),
            service.reserveOrder(mockCtx, orderB.id, 7, 'manual'),
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
            InsufficientStockError,
        );

        const allReservations = await dataSource.getRepository(TestReservation).find({
            where: { productVariantId: 'variant-1', status: 'active' },
        });
        // No double-reservation past ATP — only the winner's line got a row.
        expect(allReservations).toHaveLength(1);
        expect(allReservations[0].quantity).toBe(3);
    });

    it('is idempotent — repeat calls for an already-reserved order return the same rows without re-locking', async () => {
        await dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-2',
            stockLocationId: location.id,
            stockOnHand: 10,
            stockAllocated: 0,
        });
        const order = await dataSource.getRepository(TestOrder).save({ customFields: {} });
        await dataSource
            .getRepository(TestOrderLine)
            .save({ orderId: order.id, productVariantId: 'variant-2', quantity: 4 });

        const first = await service.reserveOrder(mockCtx, order.id, 7, 'manual');
        const second = await service.reserveOrder(mockCtx, order.id, 7, 'manual');

        expect(second.map(r => r.id)).toEqual(first.map(r => r.id));
        const all = await dataSource.getRepository(TestReservation).find({
            where: { orderId: order.id, status: 'active' },
        });
        expect(all).toHaveLength(1);
    });
});
