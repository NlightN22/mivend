import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, EntityManager, PrimaryGeneratedColumn } from 'typeorm';
import type { EntityHydrator, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { InvoiceService } from '../../invoice.service';

// Hand-rolled mirror of the invoice table (VendureEntity needs bootstrap). The race: two
// simultaneous payment submissions for one order both read "no invoices yet" and both insert.
@Entity('invoice')
class TestInvoice {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'int' }) organizationId!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'int', nullable: true }) branchId!: number | null;
    @Column({ type: 'varchar', nullable: true }) number!: string | null;
}

let dataSource: DataSource;
let service: InvoiceService;
const { schema, extra } = testSchemaOptions('invoice_creation_concurrency');

const withManager = (ctx: RequestContext, manager: EntityManager): RequestContext =>
    ({ ...ctx, __manager: manager }) as unknown as RequestContext;

const order = {
    id: 7,
    code: 'ORD-7',
    currencyCode: 'RUB',
    customer: { id: 'cust-1' },
    lines: [
        { id: 1, linePriceWithTax: 1000, customFields: { organizationId: 1 } },
        { id: 2, linePriceWithTax: 500, customFields: { organizationId: 2 } },
    ],
} as unknown as Order;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestInvoice],
        synchronize: true,
    });
    await dataSource.initialize();

    const connection = {
        getRepository: (ctx: RequestContext, entity: unknown) => {
            const manager = (ctx as unknown as { __manager?: EntityManager }).__manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager!.query(sql, params) };
            }
            return (manager ?? dataSource).getRepository(TestInvoice);
        },
        withTransaction: async (
            ctx: RequestContext,
            work: (c: RequestContext) => Promise<unknown>,
        ) => dataSource.transaction(manager => work(withManager(ctx, manager))),
    } as unknown as TransactionalConnection;

    service = new InvoiceService(
        connection,
        { hydrate: async () => undefined } as unknown as EntityHydrator,
        { getForCustomer: async () => ({ id: '42' }) } as never,
        {
            getPreferredForCustomer: async () => null,
            resolveServicingBranchId: async () => null,
        } as never,
        {} as never,
        {
            formatOrderDocumentNumber: (orderNumber: string, ordinal: number) =>
                `${orderNumber}-${String(ordinal).padStart(2, '0')}`,
        } as never,
    );
});

beforeEach(async () => {
    await dataSource.getRepository(TestInvoice).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('InvoiceService.createInvoicesForOrder under concurrent submits (real Postgres)', () => {
    it('creates one invoice per organization even when called concurrently', async () => {
        const ctx = {} as RequestContext;

        const results = await Promise.all(
            Array.from({ length: 6 }, () => service.createInvoicesForOrder(ctx, order)),
        );

        const rows = await dataSource
            .getRepository(TestInvoice)
            .find({ order: { organizationId: 'ASC' } });
        expect(rows.map(row => [row.organizationId, row.amount])).toEqual([
            [1, 1000],
            [2, 500],
        ]);
        for (const invoices of results) {
            expect(invoices).toHaveLength(2);
        }
        expect(new Set(rows.map(row => row.number)).size).toBe(rows.length);
    });

    it('keeps orders independent: concurrent calls for different orders each get their own set', async () => {
        const ctx = {} as RequestContext;
        const other = { ...order, id: 8 } as unknown as Order;

        await Promise.all([
            service.createInvoicesForOrder(ctx, order),
            service.createInvoicesForOrder(ctx, other),
            service.createInvoicesForOrder(ctx, order),
        ]);

        const rows = await dataSource.getRepository(TestInvoice).find();
        expect(rows.filter(row => row.orderId === 7)).toHaveLength(2);
        expect(rows.filter(row => row.orderId === 8)).toHaveLength(2);
    });
});
