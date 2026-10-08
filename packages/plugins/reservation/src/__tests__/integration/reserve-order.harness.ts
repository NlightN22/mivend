import { afterAll, beforeAll, beforeEach } from 'vitest';
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
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ReservationService } from '../../reservation.service';

// Same constraint as approval-workflow's integration tests (VendureEntity needs a bootstrap-time
// EntityIdStrategy for its primary column) — hand-rolled tables matching production schema,
// against real Postgres, no DB mocking. entityMap below maps the real Vendure entity classes the
// service imports (Order, Reservation, StockLevel, StockLocation) to these test tables, so
// ReservationService itself is exercised unmodified.

@Entity('reservation_test_order')
export class TestOrder {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar', nullable: true }) customerId!: string | null;
    @Column({ type: 'jsonb', default: {} }) customFields!: Record<string, unknown>;
    @OneToMany(() => TestOrderLine, line => line.order) lines!: TestOrderLine[];
}

@Entity('reservation_test_product_variant')
export class TestProductVariant {
    @PrimaryGeneratedColumn('uuid') id!: string;
    // Fixed to a single value across every test row — mivend#85's ERP-export-readiness gate
    // (Counterparty/Product.externalId/warehouse resolution) is already covered by
    // reservation.service.test.ts's unit tests; this integration suite is only about real-
    // Postgres StockLevel locking/concurrency, so warehouseService/counterpartyService/the raw
    // product-externalId query are all shimmed below to unconditionally pass that gate.
    @Column({ type: 'varchar', default: 'product-x' }) productId!: string;
    @Column({ type: 'jsonb', default: {} }) customFields!: Record<string, unknown>;
}

@Entity('reservation_test_order_line')
export class TestOrderLine {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) productVariantId!: string;
    @Column({ type: 'int' }) quantity!: number;
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar', nullable: true }) productVariantEntityId!: string | null;
    @Column({ type: 'jsonb', default: { organizationId: 1 } }) customFields!: Record<
        string,
        unknown
    >;
    @ManyToOne(() => TestOrder, order => order.lines)
    @JoinColumn({ name: 'orderId' })
    order!: TestOrder;
    @ManyToOne(() => TestProductVariant)
    @JoinColumn({ name: 'productVariantEntityId' })
    productVariant!: TestProductVariant | null;
}

@Entity('reservation_test_stock_location')
export class TestStockLocation {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar', default: 'Default Stock Location' }) name!: string;
}

@Entity('reservation_test_stock_level')
export class TestStockLevel {
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
export class TestReservation {
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

const entityMap = {
    Order: TestOrder,
    Reservation: TestReservation,
    StockLevel: TestStockLevel,
    StockLocation: TestStockLocation,
} as const;

export const mockCtx = { activeUserId: 'user-1' } as unknown as RequestContext;

function withManager(ctx: RequestContext, manager: EntityManager): RequestContext {
    return { ...ctx, __manager: manager } as unknown as RequestContext;
}

export interface ReserveOrderHarness {
    dataSource: DataSource;
    connection: TransactionalConnection;
    service: ReservationService;
    location: TestStockLocation;
    productVariant: TestProductVariant;
    published: unknown[];
}

// Registers the suite hooks; the returned object is filled in by beforeAll. ReservationService
// runs unmodified against real Postgres, only the ERP-export gate collaborators are shimmed.
export function useReserveOrderHarness(schemaKey: string): ReserveOrderHarness {
    const { schema, extra } = testSchemaOptions(schemaKey);
    const h = { published: [] as unknown[] } as ReserveOrderHarness;

    beforeAll(async () => {
        await createTestSchema(schema);
        h.dataSource = new DataSource({
            type: 'postgres',
            ...testDataSourceConnectionOptions(),
            schema,
            extra,
            entities: [
                TestOrder,
                TestOrderLine,
                TestProductVariant,
                TestStockLocation,
                TestStockLevel,
                TestReservation,
            ],
            synchronize: true,
        });
        await h.dataSource.initialize();

        h.connection = {
            // Only the mivend#85 ERP-export-readiness gate reads rawConnection.createQueryBuilder()
            // (Product.customFields.externalId): every productId resolves to a fake externalId.
            rawConnection: {
                createQueryBuilder: () => {
                    const qb = {
                        select: () => qb,
                        addSelect: () => qb,
                        from: () => qb,
                        where: () => qb,
                        getRawMany: async () => [{ id: 'product-x', externalId: 'ext-product-x' }],
                    };
                    return qb;
                },
            },
            getRepository: (ctx: RequestContext, entity: { name: string } | string) => {
                const manager = (ctx as unknown as { __manager?: EntityManager }).__manager;
                if (typeof entity === 'string') {
                    return {
                        query: (sql: string, params?: unknown[]) => manager!.query(sql, params),
                    };
                }
                const target = entityMap[entity.name as keyof typeof entityMap];
                return manager ? manager.getRepository(target) : h.dataSource.getRepository(target);
            },
            withTransaction: async (
                ctx: RequestContext,
                work: (txCtx: RequestContext) => Promise<unknown>,
            ) => h.dataSource.transaction(manager => work(withManager(ctx, manager))),
        } as unknown as TransactionalConnection;

        const eventBus = {
            publish: (event: unknown) => {
                h.published.push(event);
            },
        } as unknown as EventBus;
        h.service = new ReservationService(
            h.connection,
            eventBus,
            { findActiveStockLocationsForBranch: async () => [h.location] } as never,
            { getForCustomer: async () => ({ erpId: 'counterparty-x' }) } as never,
            { resolveOrderContract: async () => ({ erpId: 'contract-x' }) } as never,
        );
        h.location = await h.dataSource.getRepository(TestStockLocation).save({});
        h.productVariant = await h.dataSource
            .getRepository(TestProductVariant)
            .save({ customFields: { organizationId: 1 } });
    });

    afterAll(async () => {
        await h.dataSource.destroy();
        await dropTestSchema(schema);
    });

    beforeEach(async () => {
        h.published.length = 0;
        await h.dataSource.query(
            'TRUNCATE TABLE reservation_test_reservation, reservation_test_order_line, ' +
                'reservation_test_order, reservation_test_stock_level CASCADE',
        );
    });

    return h;
}
