import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    CreateDateColumn,
    DataSource,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Order, OrderLine } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import {
    EXTERNAL_ORDER_OWNER_CLAUSE,
    ExternalOrderReconcileService,
    ExternalOrderService,
} from '@mivend/plugin-erp-order';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderChangedStreamHandler } from '../../../handlers/order-changed.handler';

// Real handler + real ExternalOrderService on real Postgres; hand-rolled tables use the production
// column names so the services' raw SQL runs unchanged.
class TestOrderCustomFields {
    @Column({ name: 'customFieldsErporderid', type: 'varchar', nullable: true, unique: true })
    erpOrderId!: string | null;
    @Column({ name: 'customFieldsErpstatus', type: 'varchar', nullable: true })
    erpStatus!: string | null;
    @Column({ name: 'customFieldsErpstatusat', type: 'timestamp', nullable: true })
    erpStatusAt!: Date | null;
    @Column({ name: 'customFieldsErporderstatus', type: 'varchar', nullable: true })
    erpOrderStatus!: string | null;
    @Column({ name: 'customFieldsErpregistrationdocumentnumber', type: 'varchar', nullable: true })
    erpRegistrationDocumentNumber!: string | null;
    @Column({ name: 'customFieldsErpcontractid', type: 'varchar', nullable: true })
    erpContractId!: string | null;
    @Column({ name: 'customFieldsErppaidamount', type: 'float', nullable: true })
    erpPaidAmount!: number | null;
    @Column({ name: 'customFieldsIsexternal', type: 'boolean', default: false })
    isExternal!: boolean;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
    @Column({ name: 'customFieldsPendingcounterpartyerpid', type: 'varchar', nullable: true })
    pendingCounterpartyErpId!: string | null;
    @Column({ name: 'customFieldsBranchid', type: 'varchar', nullable: true })
    branchId!: string | null;
    @Column({ name: 'customFieldsExternallinesincomplete', type: 'boolean', default: false })
    externalLinesIncomplete!: boolean;
}

@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @CreateDateColumn() createdAt!: Date;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar' }) state!: string;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'int', default: 0 }) subTotal!: number;
    @Column({ type: 'int', default: 0 }) subTotalWithTax!: number;
    @Column({ type: 'timestamp', nullable: true }) orderPlacedAt!: Date | null;
    @Column({ type: 'int', nullable: true }) customerId!: number | null;
    @Column(() => TestOrderCustomFields, { prefix: false }) customFields!: TestOrderCustomFields;
}

@Entity('order_line')
class TestOrderLine {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productVariantId!: number;
    @Column({ type: 'int' }) taxCategoryId!: number;
    @Column({ type: 'int' }) quantity!: number;
    @Column({ type: 'int' }) listPrice!: number;
    @Column({ type: 'int', nullable: true }) orderId!: number;
    @ManyToOne(() => TestOrder, { createForeignKeyConstraints: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'orderId' })
    order!: TestOrder;
}

@Entity('product')
class TestProduct {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ name: 'customFieldsExternalid', type: 'varchar' }) externalId!: string;
}

@Entity('product_variant')
class TestVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productId!: number;
    @Column({ type: 'int' }) taxCategoryId!: number;
    @Column({ name: 'customFieldsDefaultsalesunitid', type: 'varchar', nullable: true })
    defaultSalesUnitId!: string | null;
    @Column({ name: 'customFieldsUnitratiotobase', type: 'float', nullable: true })
    unitRatioToBase!: number | null;
}

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

const { schema, extra } = testSchemaOptions('order_changed_external');
const ERP_ORDER = 'erp-order-1';
let dataSource: DataSource;
let handler: OrderChangedStreamHandler;
let externalOrders: ExternalOrderService;
let ctx: RequestContext;

const entityMap = new Map<unknown, unknown>([
    [Order, TestOrder],
    [OrderLine, TestOrderLine],
]);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder, TestOrderLine, TestProduct, TestVariant, TestCounterparty],
        synchronize: true,
    });
    await dataSource.initialize();

    const managerOf = (c: RequestContext): EntityManager | undefined =>
        (c as unknown as { __manager?: EntityManager }).__manager;
    const connection = {
        rawConnection: dataSource,
        withTransaction: async (
            c: RequestContext,
            work: (x: RequestContext) => Promise<unknown>,
        ) =>
            managerOf(c)
                ? work(c)
                : dataSource.transaction(manager =>
                      work({ ...c, __manager: manager } as unknown as RequestContext),
                  ),
        getRepository: (c: RequestContext, entity: unknown) => {
            const target = entityMap.get(entity);
            const manager = managerOf(c) ?? dataSource.manager;
            return target
                ? manager.getRepository(target as never)
                : { query: manager.query.bind(manager) };
        },
    };
    let code = 0;
    const config = {
        orderOptions: { orderCodeStrategy: { generate: async () => String(++code) } },
    };
    const counterparties = {
        findByErpId: (_c: RequestContext, erpId: string) =>
            dataSource.getRepository(TestCounterparty).findOne({ where: { erpId } }),
    };
    externalOrders = new ExternalOrderService(
        connection as never,
        config as never,
        counterparties as never,
        { record: async () => undefined } as never,
    );
    handler = new OrderChangedStreamHandler(
        connection as never,
        { handleOrderChanged: vi.fn() } as never,
        { findByEntityId: vi.fn() } as never,
        externalOrders,
        { attachOrder: vi.fn() } as never,
    );
    ctx = { channel: { defaultCurrencyCode: 'RUB' } } as unknown as RequestContext;
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE TABLE "order", order_line, product, product_variant, counterparty RESTART IDENTITY CASCADE',
    );
    const product = await dataSource.getRepository(TestProduct).save({ externalId: 'prod-1' });
    await dataSource.getRepository(TestVariant).save({ productId: product.id, taxCategoryId: 3 });
});

const payload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    status: '',
    customerId: 'cp-1',
    documentNumber: 'DOC-1',
    orderDate: '2025-03-01T10:00:00Z',
    currency: '643',
    totalAmount: 250.5,
    vatTotal: 41.75,
    amountIncludesVat: true,
    lines: [{ productId: 'prod-1', quantity: 2, price: 130, amount: 250.5 }],
    ...overrides,
});

const orders = (): Promise<TestOrder[]> =>
    dataSource.getRepository(TestOrder).find({ order: { id: 'ASC' } });
const addCounterparty = (
    erpId: string,
    branchId: string | null = null,
): Promise<TestCounterparty> =>
    dataSource.getRepository(TestCounterparty).save({ erpId, branchId });

describe('order-changed without orderUuid (component, real Postgres)', () => {
    it('creates an external order for a known counterparty with an empty status', async () => {
        const cp = await addCounterparty('cp-1');

        const outcome = await handler.apply(ctx, ERP_ORDER, payload());

        expect(outcome).toEqual({ kind: 'applied' });
        const [order] = await orders();
        expect(order).toMatchObject({
            state: 'PaymentAuthorized',
            currencyCode: 'RUB',
            subTotalWithTax: 25050,
            subTotal: 20875,
            customerId: null,
        });
        expect(order.customFields).toMatchObject({
            isExternal: true,
            erpOrderId: ERP_ORDER,
            erpStatus: 'CONFIRMED',
            erpOrderStatus: '',
            counterpartyId: String(cp.id),
            pendingCounterpartyErpId: null,
            erpRegistrationDocumentNumber: 'DOC-1',
        });
        const lines = await dataSource.getRepository(TestOrderLine).find();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ quantity: 2, listPrice: 12525 });
    });

    it('maps the cancelled fact directly to the Cancelled state', async () => {
        await addCounterparty('cp-1');
        await handler.apply(ctx, ERP_ORDER, payload({ markedForDeletion: true }));
        expect((await orders())[0]).toMatchObject({ state: 'Cancelled' });
    });

    it('keeps the order pending until the counterparty arrives, then attaches only that one', async () => {
        const outcome = await handler.apply(ctx, ERP_ORDER, payload());
        await handler.apply(ctx, 'erp-order-2', payload({ customerId: 'cp-2' }));
        expect(outcome).toMatchObject({ kind: 'noop' });
        const pending = await orders();
        expect(pending[0].customFields).toMatchObject({
            counterpartyId: null,
            pendingCounterpartyErpId: 'cp-1',
        });

        const cp = await addCounterparty('cp-1');
        await externalOrders.attachCounterparty(ctx, 'cp-1', String(cp.id));

        const [first, foreign] = await orders();
        expect(first.customFields).toMatchObject({
            counterpartyId: String(cp.id),
            pendingCounterpartyErpId: null,
        });
        expect(foreign.customFields).toMatchObject({
            counterpartyId: null,
            pendingCounterpartyErpId: 'cp-2',
        });
    });

    it('redelivery updates the same row and does not duplicate lines', async () => {
        await addCounterparty('cp-1');
        await handler.apply(ctx, ERP_ORDER, payload());
        await handler.apply(ctx, ERP_ORDER, payload({ delivered: true }));
        await handler.apply(ctx, ERP_ORDER, payload({ delivered: true }));

        const rows = await orders();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ state: 'Delivered' });
        expect(await dataSource.getRepository(TestOrderLine).count()).toBe(1);
    });

    it('concurrent deliveries of the same erpOrderId produce exactly one order', async () => {
        await addCounterparty('cp-1');

        const results = await Promise.allSettled(
            Array.from({ length: 6 }, () => handler.apply(ctx, ERP_ORDER, payload())),
        );

        expect(results.every(r => r.status === 'fulfilled')).toBe(true);
        expect(await orders()).toHaveLength(1);
        expect(await dataSource.getRepository(TestOrderLine).count()).toBe(1);
    });

    it('does not touch a mivend order matched by erpOrderId', async () => {
        await dataSource.getRepository(TestOrder).save({
            code: 'M-1',
            state: 'PaymentAuthorized',
            currencyCode: 'RUB',
            customFields: { erpOrderId: ERP_ORDER, isExternal: false },
        });
        const sync = { handleOrderChanged: vi.fn() };
        const mivendHandler = new OrderChangedStreamHandler(
            { rawConnection: dataSource } as never,
            sync as never,
            { findByEntityId: vi.fn() } as never,
            externalOrders,
            { attachOrder: vi.fn() } as never,
        );

        await mivendHandler.apply(ctx, ERP_ORDER, { lines: [] });

        expect(sync.handleOrderChanged).toHaveBeenCalledTimes(1);
        expect(await orders()).toHaveLength(1);
    });

    describe('status never rolls back', () => {
        beforeEach(async () => {
            await addCounterparty('cp-1');
        });

        it('keeps DELIVERED when a later event carries no facts, still refreshing raw fields', async () => {
            await handler.apply(ctx, ERP_ORDER, payload({ delivered: true }));

            await handler.apply(
                ctx,
                ERP_ORDER,
                payload({ status: 'raw-2', documentNumber: 'DOC-2' }),
            );

            const [order] = await orders();
            expect(order.state).toBe('Delivered');
            expect(order.customFields).toMatchObject({
                erpStatus: 'DELIVERED',
                erpOrderStatus: 'raw-2',
                erpRegistrationDocumentNumber: 'DOC-2',
            });
        });

        it('keeps DELIVERED when a later fact derives an earlier status', async () => {
            await handler.apply(ctx, ERP_ORDER, payload({ delivered: true }));

            await handler.apply(ctx, ERP_ORDER, payload({ hasOrder: true }));

            expect((await orders())[0]).toMatchObject({ state: 'Delivered' });
        });

        it('keeps CANCELLED terminal even when a later event says delivered', async () => {
            await handler.apply(ctx, ERP_ORDER, payload({ markedForDeletion: true }));

            await handler.apply(ctx, ERP_ORDER, payload({ delivered: true }));
            await handler.apply(ctx, ERP_ORDER, payload());

            const [order] = await orders();
            expect(order.state).toBe('Cancelled');
            expect(order.customFields.erpStatus).toBe('CANCELLED');
        });

        it('moves forward and may cancel from any non-cancelled status', async () => {
            await handler.apply(ctx, ERP_ORDER, payload({ inDelivery: true }));
            expect((await orders())[0]).toMatchObject({ state: 'Shipped' });

            await handler.apply(ctx, ERP_ORDER, payload({ markedForDeletion: true }));

            expect((await orders())[0]).toMatchObject({ state: 'Cancelled' });
        });

        it('does not clear the known counterparty or document number from a sparse event', async () => {
            await handler.apply(ctx, ERP_ORDER, payload());

            await handler.apply(
                ctx,
                ERP_ORDER,
                payload({ customerId: undefined, documentNumber: '' }),
            );

            const [order] = await orders();
            expect(order.customFields.counterpartyId).not.toBeNull();
            expect(order.customFields.erpRegistrationDocumentNumber).toBe('DOC-1');
        });
    });

    describe('paid amount', () => {
        beforeEach(async () => {
            await addCounterparty('cp-1');
        });

        it('stores the paid amount, keeps it when a later event omits it, and refreshes it', async () => {
            await handler.apply(ctx, ERP_ORDER, payload({ paidAmount: 100.5 }));
            expect((await orders())[0].customFields.erpPaidAmount).toBe(10050);

            await handler.apply(ctx, ERP_ORDER, payload());
            expect((await orders())[0].customFields.erpPaidAmount).toBe(10050);

            await handler.apply(ctx, ERP_ORDER, payload({ paidAmount: 250.5 }));
            expect((await orders())[0].customFields.erpPaidAmount).toBe(25050);
        });

        it('leaves it null when never reported', async () => {
            await handler.apply(ctx, ERP_ORDER, payload());
            expect((await orders())[0].customFields.erpPaidAmount).toBeNull();
        });
    });

    describe('lines of unknown products', () => {
        const mixedLines = [
            { productId: 'prod-1', quantity: 2, price: 130, amount: 250.5 },
            { productId: 'prod-missing', quantity: 1, price: 10, amount: 10 },
        ];

        it('flags the order incomplete, then clears the flag once all lines resolve', async () => {
            await addCounterparty('cp-1');
            const outcome = await handler.apply(ctx, ERP_ORDER, payload({ lines: mixedLines }));
            expect(outcome).toMatchObject({ kind: 'noop' });
            expect((await orders())[0].customFields.externalLinesIncomplete).toBe(true);
            expect(await dataSource.getRepository(TestOrderLine).count()).toBe(1);

            await handler.apply(ctx, ERP_ORDER, payload());

            expect((await orders())[0].customFields.externalLinesIncomplete).toBe(false);
        });
    });

    describe('counterparty branch', () => {
        it('copies the counterparty branch onto the order, also when attached later', async () => {
            await addCounterparty('cp-1', 'branch-a');
            await handler.apply(ctx, ERP_ORDER, payload());
            await handler.apply(ctx, 'erp-order-2', payload({ customerId: 'cp-2' }));

            const late = await addCounterparty('cp-2', 'branch-b');
            await externalOrders.attachCounterparty(ctx, 'cp-2', String(late.id));

            const [first, second] = await orders();
            expect(first.customFields.branchId).toBe('branch-a');
            expect(second.customFields.branchId).toBe('branch-b');
        });
    });

    describe('pending counterparty reconciliation', () => {
        const reconciler = (): ExternalOrderReconcileService =>
            new ExternalOrderReconcileService(
                {
                    getRepository: () => ({
                        query: dataSource.query.bind(dataSource),
                    }),
                } as never,
                {
                    findByErpId: (_c: RequestContext, erpId: string) =>
                        dataSource.getRepository(TestCounterparty).findOne({ where: { erpId } }),
                } as never,
                externalOrders,
                { isWorker: false } as never,
                {} as never,
            );

        it('attaches counterparties that arrived without an event, twice safely', async () => {
            await handler.apply(ctx, ERP_ORDER, payload());
            await handler.apply(ctx, 'erp-order-2', payload({ customerId: 'cp-2' }));
            const cp = await addCounterparty('cp-1');

            const first = await reconciler().reconcilePendingCounterparties(ctx);
            const second = await reconciler().reconcilePendingCounterparties(ctx);

            expect(first).toEqual({ counterparties: 1, orders: 1 });
            expect(second).toEqual({ counterparties: 0, orders: 0 });
            const [attached, stillPending] = await orders();
            expect(attached.customFields).toMatchObject({
                counterpartyId: String(cp.id),
                pendingCounterpartyErpId: null,
            });
            expect(stillPending.customFields.pendingCounterpartyErpId).toBe('cp-2');
        });
    });

    describe('customer order list isolation', () => {
        const visibleTo = async (counterpartyId: string): Promise<string[]> => {
            const rows: Array<{ code: string }> = await dataSource.query(
                `SELECT code FROM "order"
                 WHERE ${EXTERNAL_ORDER_OWNER_CLAUSE.replace(':counterpartyId', '$1')}
                 ORDER BY id`,
                [counterpartyId],
            );
            return rows.map(r => r.code);
        };

        it('an external order of counterparty A is invisible to counterparty B and vice versa', async () => {
            const a = await addCounterparty('cp-a');
            const b = await addCounterparty('cp-b');
            await handler.apply(ctx, 'erp-a', payload({ customerId: 'cp-a' }));
            await handler.apply(ctx, 'erp-b', payload({ customerId: 'cp-b' }));
            const [orderA, orderB] = await orders();

            expect(await visibleTo(String(a.id))).toEqual([orderA.code]);
            expect(await visibleTo(String(b.id))).toEqual([orderB.code]);
            expect(await visibleTo(String(b.id))).not.toContain(orderA.code);
        });

        it('a pending external order is visible to nobody', async () => {
            const a = await addCounterparty('cp-a');
            await handler.apply(ctx, 'erp-x', payload({ customerId: 'cp-unknown' }));

            expect(await visibleTo(String(a.id))).toEqual([]);
        });
    });
});
