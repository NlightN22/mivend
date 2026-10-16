import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, EntityManager, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ProformaInvoiceIssuingService } from '../../proforma-invoice-issuing.service';
import { ProformaInvoiceService } from '../../proforma-invoice.service';

// Mirror of the proforma_invoice table (VendureEntity needs bootstrap), real Postgres.
@Entity('proforma_invoice')
class TestProformaInvoice {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'varchar', nullable: true }) number!: string | null;
    @Column({ type: 'int' }) organizationId!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'jsonb', default: () => "'[]'" }) lines!: unknown[];
    @Column({ type: 'int', default: 1 }) version!: number;
    @Column({ type: 'int', nullable: true }) supersedesId!: number | null;
    @Column({ type: 'int', nullable: true }) supersededById!: number | null;
    @Column({ type: 'timestamptz', default: () => 'now()' }) issuedAt!: Date;
    @Column({ type: 'timestamptz', default: () => 'now()' }) dueDate!: Date;
    @Column({ type: 'varchar', default: 'order-placed' }) kind!: string;
    @Column({ type: 'varchar', nullable: true }) salesInvoiceNumber!: string | null;
}

let dataSource: DataSource;
let issuing: ProformaInvoiceIssuingService;
let published: unknown[];
let orderLines: unknown[];
let termDays = 3;
let orderState: { state: string; active: boolean };
const { schema, extra } = testSchemaOptions('proformaInvoice_versions');

const withManager = (ctx: RequestContext, manager: EntityManager): RequestContext =>
    ({ ...ctx, __manager: manager }) as unknown as RequestContext;

function orderLine(id: number, organizationId: number, price: number, quantity = 1) {
    return {
        id,
        quantity,
        unitPriceWithTax: price,
        linePriceWithTax: price * quantity,
        discounts: [],
        customFields: { organizationId },
        productVariant: { id, sku: `sku-${id}`, name: `Item ${id}` },
    };
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProformaInvoice],
        synchronize: true,
    });
    await dataSource.initialize();

    const connection = {
        getRepository: (ctx: RequestContext, entity: unknown) => {
            const manager = (ctx as unknown as { __manager?: EntityManager }).__manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager!.query(sql, params) };
            }
            if ((entity as { name?: string }).name === 'Order') {
                return {
                    findOne: async () => ({
                        id: 7,
                        code: '1000007',
                        currencyCode: 'RUB',
                        customer: { id: 'cust-1' },
                        customFields: { isExternal: false },
                        lines: orderLines,
                        ...orderState,
                    }),
                };
            }
            return (manager ?? dataSource).getRepository(TestProformaInvoice);
        },
        withTransaction: async (
            ctx: RequestContext,
            work: (c: RequestContext) => Promise<unknown>,
        ) => dataSource.transaction(manager => work(withManager(ctx, manager))),
    } as unknown as TransactionalConnection;

    issuing = new ProformaInvoiceIssuingService(
        connection,
        { getForCustomer: async () => ({ id: '42' }) } as never,
        {
            getPreferredForCustomer: async () => null,
            resolveServicingBranchId: async () => null,
        } as never,
        { translate: (entity: unknown) => entity } as never,
        {
            formatOrderDocumentNumber: (orderNumber: string, ordinal: number, version: number) =>
                `${orderNumber}-${String(ordinal).padStart(2, '0')}-${version}`,
        } as never,
        { publish: vi.fn(async (event: unknown) => published.push(event)) } as never,
        { resolveEffective: async () => ({ proformaPaymentTermDays: termDays }) } as never,
    );
});

beforeEach(async () => {
    await dataSource.getRepository(TestProformaInvoice).clear();
    published = [];
    termDays = 3;
    orderState = { state: 'PaymentAuthorized', active: false };
    orderLines = [orderLine(1, 1, 1000), orderLine(2, 2, 500)];
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const ctx = {} as RequestContext;
const rows = () => dataSource.getRepository(TestProformaInvoice).find({ order: { id: 'ASC' } });

describe('ProformaInvoiceIssuingService versions (real Postgres)', () => {
    it('is idempotent: unchanged content returns the same snapshots', async () => {
        const first = await issuing.issueForOrder(ctx, 7);
        const second = await issuing.issueForOrder(ctx, 7);

        expect(second.created).toHaveLength(0);
        expect(second.current.map(i => i.id)).toEqual(first.current.map(i => i.id));
        expect((await rows()).map(r => r.number)).toEqual(['1000007-01-1', '1000007-02-1']);
    });

    it('creates a new version keeping the document id (order-NN) and supersedes the unpaid one', async () => {
        await issuing.issueForOrder(ctx, 7, { initialStatus: 'issued' });
        orderLines = [orderLine(1, 1, 1000, 3), orderLine(2, 2, 500)];

        const result = await issuing.issueForOrder(ctx, 7);

        const all = await rows();
        expect(result.created).toHaveLength(1);
        const [v1, , v2] = all;
        expect(v2).toMatchObject({
            number: '1000007-01-2',
            version: 2,
            kind: 'order-changed',
            amount: 3000,
            status: 'issued',
            supersedesId: v1.id,
        });
        expect(v1).toMatchObject({ status: 'superseded', supersededById: v2.id, amount: 1000 });
        expect(result.current.map(i => i.number)).toEqual(['1000007-01-2', '1000007-02-1']);
    });

    it('keeps a paid snapshot untouched and reports the difference', async () => {
        await issuing.issueForOrder(ctx, 7);
        await dataSource
            .getRepository(TestProformaInvoice)
            .update({ organizationId: 1 }, { status: 'paid' });
        orderLines = [orderLine(1, 1, 1000, 3), orderLine(2, 2, 500)];

        const result = await issuing.issueForOrder(ctx, 7);

        expect(result.created).toHaveLength(0);
        const paid = (await rows()).find(r => r.organizationId === 1)!;
        expect(paid).toMatchObject({ status: 'paid', version: 1, amount: 1000 });
        await expect(issuing.differenceAfterPayment(ctx, paid as never)).resolves.toBe(2000);
    });

    it('keeps a paid snapshot and reports a negative difference when the order shrinks', async () => {
        orderLines = [orderLine(1, 1, 1000, 3), orderLine(2, 2, 500)];
        await issuing.issueForOrder(ctx, 7);
        await dataSource
            .getRepository(TestProformaInvoice)
            .update({ organizationId: 1 }, { status: 'paid' });
        orderLines = [orderLine(1, 1, 1000, 1), orderLine(2, 2, 500)];

        const result = await issuing.issueForOrder(ctx, 7);

        expect(result.created).toHaveLength(0);
        const paid = (await rows()).find(r => r.organizationId === 1)!;
        expect(paid).toMatchObject({ status: 'paid', version: 1, amount: 3000 });
        await expect(issuing.differenceAfterPayment(ctx, paid as never)).resolves.toBe(-2000);
    });

    it('creates one snapshot per organization under concurrent requests', async () => {
        const results = await Promise.all(
            Array.from({ length: 6 }, () => issuing.requestForOrder(ctx, 7)),
        );

        expect(await rows()).toHaveLength(2);
        for (const current of results) expect(current).toHaveLength(2);
        expect(published).toHaveLength(2);
    });

    it('concurrent requests after a content change create exactly one new version', async () => {
        await issuing.issueForOrder(ctx, 7, { initialStatus: 'issued' });
        orderLines = [orderLine(1, 1, 1000, 2), orderLine(2, 2, 500)];

        await Promise.all(Array.from({ length: 5 }, () => issuing.requestForOrder(ctx, 7)));

        const all = await rows();
        expect(all).toHaveLength(3);
        expect(all.filter(r => r.status === 'superseded')).toHaveLength(1);
        expect(new Set(all.map(r => r.number)).size).toBe(3);
    });

    it('refuses a cancelled or unplaced order', async () => {
        orderState = { state: 'Cancelled', active: false };
        await expect(issuing.requestForOrder(ctx, 7)).rejects.toThrow(/cancelled/);
        orderState = { state: 'ArrangingPayment', active: true };
        await expect(issuing.requestForOrder(ctx, 7)).rejects.toThrow(/placed/);
        orderState = { state: 'Draft', active: false };
        await expect(issuing.requestForOrder(ctx, 7)).rejects.toThrow(/placed/);
        orderState = { state: 'ArrangingPayment', active: false };
        await expect(issuing.requestForOrder(ctx, 7)).rejects.toThrow(/placed/);
    });

    it('refuses an order that came from the ERP and creates nothing', async () => {
        orderState = {
            state: 'PaymentAuthorized',
            active: false,
            customFields: { isExternal: true },
        } as typeof orderState;

        await expect(issuing.requestForOrder(ctx, 7)).rejects.toThrow(/from the ERP/);

        expect(await rows()).toHaveLength(0);
    });

    it('cancels the unpaid snapshot of an organization removed from the order', async () => {
        await issuing.issueForOrder(ctx, 7);
        orderLines = [orderLine(1, 1, 1000)];

        await issuing.issueForOrder(ctx, 7);

        const removed = (await rows()).find(r => r.organizationId === 2)!;
        expect(removed.status).toBe('cancelled');
    });
});

describe('head selection and numbering (real Postgres)', () => {
    it('issues a new version of the same document when a removed organization returns', async () => {
        await issuing.issueForOrder(ctx, 7, { initialStatus: 'issued' });
        orderLines = [orderLine(1, 1, 1000)];
        await issuing.issueForOrder(ctx, 7);
        orderLines = [orderLine(1, 1, 1000), orderLine(2, 2, 500)];

        const result = await issuing.issueForOrder(ctx, 7, { initialStatus: 'issued' });

        const org2 = (await rows()).filter(r => r.organizationId === 2);
        expect(org2.map(r => [r.version, r.status])).toEqual([
            [1, 'cancelled'],
            [2, 'issued'],
        ]);
        expect(result.current.filter(i => i.organizationId === 2)).toHaveLength(2);
        expect(result.created[0].number).toBe('1000007-02-2');
    });

    it('picks the highest version, then the highest id, among non-superseded rows', async () => {
        const repo = dataSource.getRepository(TestProformaInvoice);
        const base = { orderId: 7, organizationId: 1, counterpartyId: 42, currencyCode: 'RUB' };
        await repo.save([
            { ...base, amount: 1, status: 'issued', version: 2, number: '1000007-05-2' },
            { ...base, amount: 1, status: 'issued', version: 1, number: '1000007-05-1' },
        ]);
        orderLines = [orderLine(1, 1, 1000)];

        const result = await issuing.issueForOrder(ctx, 7);

        expect(result.created[0]).toMatchObject({ version: 3, number: '1000007-05-3' });
    });
});

describe('mixed legacy and versioned numbers (real Postgres)', () => {
    it('counts a pre-versioning number as its ordinal when numbering a new organization', async () => {
        const base = {
            orderId: 7,
            counterpartyId: 42,
            currencyCode: 'RUB',
            status: 'issued' as const,
        };
        await dataSource.getRepository(TestProformaInvoice).save([
            { ...base, organizationId: 1, amount: 1, version: 1, number: '1000007-03' },
            { ...base, organizationId: 3, amount: 1, version: 1, number: '1000007-02-1' },
        ]);
        orderLines = [orderLine(1, 1, 1000), orderLine(2, 2, 500)];

        const result = await issuing.issueForOrder(ctx, 7);

        expect(result.created.find(i => i.organizationId === 2)?.number).toBe('1000007-04-1');
    });
});

describe('document id, dates and kind (real Postgres)', () => {
    it('gives a new organization the next ordinal and keeps v1 numbers stable across versions', async () => {
        orderLines = [orderLine(1, 1, 1000)];
        await issuing.issueForOrder(ctx, 7);
        orderLines = [orderLine(1, 1, 1000, 2)];
        await issuing.issueForOrder(ctx, 7);
        orderLines = [orderLine(1, 1, 1000, 2), orderLine(2, 2, 500)];
        await issuing.issueForOrder(ctx, 7);
        orderLines = [orderLine(1, 1, 1000, 3), orderLine(2, 2, 500)];
        await issuing.issueForOrder(ctx, 7);

        expect((await rows()).map(r => r.number)).toEqual([
            '1000007-01-1',
            '1000007-01-2',
            '1000007-02-1',
            '1000007-01-3',
        ]);
    });

    it('stamps each version with its own issue date, due date from the term, and kind', async () => {
        termDays = 5;
        await issuing.issueForOrder(ctx, 7);
        orderLines = [orderLine(1, 1, 1000, 2), orderLine(2, 2, 500)];
        termDays = 2;
        await issuing.issueForOrder(ctx, 7);

        const org1 = (await rows()).filter(r => r.organizationId === 1);
        const days = (r: TestProformaInvoice) =>
            Math.round((r.dueDate.getTime() - r.issuedAt.getTime()) / 86_400_000);
        expect(org1.map(r => [r.kind, days(r)])).toEqual([
            ['order-placed', 5],
            ['order-changed', 2],
        ]);
        expect(org1[1].issuedAt.getTime()).toBeGreaterThanOrEqual(org1[0].issuedAt.getTime());
        expect(org1.every(r => r.salesInvoiceNumber === null)).toBe(true);
    });
});

describe('ProformaInvoiceService.updateStatusForOrder', () => {
    it('moves only pending snapshots, never paid or superseded ones', async () => {
        const repo = dataSource.getRepository(TestProformaInvoice);
        await repo.save([
            {
                orderId: 9,
                organizationId: 1,
                counterpartyId: 1,
                amount: 1,
                currencyCode: 'RUB',
                status: 'pending',
            },
            {
                orderId: 9,
                organizationId: 2,
                counterpartyId: 1,
                amount: 1,
                currencyCode: 'RUB',
                status: 'paid',
            },
            {
                orderId: 9,
                organizationId: 3,
                counterpartyId: 1,
                amount: 1,
                currencyCode: 'RUB',
                status: 'superseded',
            },
        ]);
        const service = new ProformaInvoiceService({
            getRepository: () => repo,
        } as unknown as TransactionalConnection);

        await service.updateStatusForOrder(ctx, 9, 'issued');

        const all = await repo.find({ where: { orderId: 9 }, order: { id: 'ASC' } });
        expect(all.map(r => r.status)).toEqual(['issued', 'paid', 'superseded']);
    });
});
