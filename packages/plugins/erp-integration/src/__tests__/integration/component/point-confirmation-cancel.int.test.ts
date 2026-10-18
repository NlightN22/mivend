import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    EntityManager,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { testOrderStatusDictionary } from '@mivend/plugin-erp-order';
import {
    OrderCancellationPortRegistry,
    OrderCancellationService,
} from '@mivend/plugin-reservation';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxService } from '../../../integration-outbox.service';
import { OrderCancellationAdapter } from '../../../order-cancellation.adapter';
import { PointConfirmationExpiryService } from '../../../order-checks/point-confirmation-expiry.service';
import { COURIER_POINT_UNCONFIRMED_SKIP_REASON } from '../../../order-submitted.builder';
import { OutboundGateway } from '../../../outbound-gateway';

class TestOrderCustomFields {
    @Column({ type: 'varchar', nullable: true }) uuid!: string | null;
    @Column({ type: 'boolean', default: false }) isExternal!: boolean;
    @Column({ type: 'varchar', nullable: true }) erpStatus!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpOrderId!: string | null;
    @Column({ type: 'varchar', nullable: true }) latestFulfillmentState!: string | null;
    @Column({ type: 'varchar', nullable: true }) cancelRequestStatus!: string | null;
    @Column({ type: 'varchar', nullable: true }) cancelReason!: string | null;
    @Column({ type: 'timestamp', nullable: true }) cancelRequestedAt!: Date | null;
    @Column({ type: 'int', nullable: true }) reservationdays!: number | null;
}

@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar', default: 'ArrangingPayment' }) state!: string;
    @Column({ name: 'orderPlacedAt', type: 'timestamp', nullable: true })
    orderPlacedAt!: Date | null;
    @Column(() => TestOrderCustomFields) customFields!: TestOrderCustomFields;
}

@Entity('payment')
class TestPayment {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) state!: string;
    @Column({ type: 'int' }) orderId!: number;
    @ManyToOne(() => TestOrder)
    @JoinColumn({ name: 'orderId' })
    order!: TestOrder;
}

const { schema, extra } = testSchemaOptions('erp_point_confirmation_cancel');
let dataSource: DataSource;
let expiry: PointConfirmationExpiryService;
const tables: Record<string, new () => object> = { Order: TestOrder, Payment: TestPayment };
type Ctx = { __manager?: EntityManager };

// Real OrderCancellationService + real outbox adapter: only Vendure services and the bus are faked.
beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationOutboxEntry, TestOrder, TestPayment],
        synchronize: true,
    });
    await dataSource.initialize();

    const connection = {
        getRepository: (ctx: Ctx, entity: { name: string } | string) => {
            if (typeof entity === 'string') {
                return { query: (sql: string, p?: unknown[]) => ctx.__manager!.query(sql, p) };
            }
            return (ctx.__manager ?? dataSource.manager).getRepository(tables[entity.name]);
        },
        withTransaction: async (ctx: Ctx, work: (c: Ctx) => Promise<unknown>) =>
            ctx.__manager
                ? work(ctx)
                : dataSource.transaction(manager => work({ ...ctx, __manager: manager })),
    };
    const orderService = {
        cancelOrder: async (ctx: Ctx, input: { orderId: number }) => {
            await ctx.__manager!.getRepository(TestOrder).update(input.orderId, {
                state: 'Cancelled',
            });
            return { id: input.orderId };
        },
    };
    const registry = new OrderCancellationPortRegistry();
    registry.register(
        new OrderCancellationAdapter(
            new OutboundGateway(dataSource, new IntegrationOutboxService()),
            registry,
        ),
    );
    const cancellation = new OrderCancellationService(
        connection as never,
        orderService as never,
        { cancelPayment: async () => undefined } as never,
        { releaseReservations: async () => undefined } as never,
        { create: async () => undefined } as never,
        { publish: () => undefined } as never,
        registry,
        { dictionary: async () => testOrderStatusDictionary() } as never,
    );
    expiry = new PointConfirmationExpiryService(
        dataSource,
        connection as never,
        { create: async () => ({}) } as never,
        cancellation,
        { create: async () => undefined } as never,
        { defaultReservationDays: () => 3 } as never,
    );
});

afterEach(async () => {
    await dataSource.query(
        'TRUNCATE "order", payment, integration_outbox RESTART IDENTITY CASCADE',
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('point-confirmation expiry through the real cancel flow', () => {
    it('cancels an unsent order with a skipped confirmed row locally and sends nothing to the ERP', async () => {
        const order = await dataSource.getRepository(TestOrder).save({
            code: 'ORD-1',
            orderPlacedAt: new Date(Date.now() - 4 * 86_400_000),
            customFields: { uuid: randomUUID(), erpStatus: 'PENDING' },
        } as TestOrder);
        const outbox = dataSource.getRepository(IntegrationOutboxEntry);
        await outbox.save(
            outbox.create({
                eventId: randomUUID(),
                eventType: 'order.confirmed',
                payload: { orderId: String(order.id) },
                status: 'skipped',
                lastError: COURIER_POINT_UNCONFIRMED_SKIP_REASON,
            }),
        );

        expect(await expiry.expireDue()).toBe(1);

        const reloaded = await dataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(reloaded.state).toBe('Cancelled');
        expect(reloaded.customFields.cancelReason).toBe('point-confirmation-expired');
        expect(reloaded.customFields.cancelRequestStatus).toBeNull();
        expect(await outbox.count({ where: { eventType: 'order.cancel-requested' } })).toBe(0);
        expect(await expiry.expireDue()).toBe(0);
    });
});
