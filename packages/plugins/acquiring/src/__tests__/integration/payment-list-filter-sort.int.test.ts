import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource, EntitySchema } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import type { AccessScope } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { PaymentVisibilityService } from '../../payment-visibility.service';
import { ProformaInvoiceVisibilityService } from '../../proforma-invoice-visibility.service';
import type { PaymentListOptions } from '../../payment-attempt-query.service';

const paymentSchema = new EntitySchema({
    name: 'payment_attempt',
    target: PaymentAttempt,
    columns: {
        id: { type: Number, primary: true, generated: true },
        number: { type: String },
        channel: { type: String },
        proformaInvoiceId: { type: Number, nullable: true },
        orderId: { type: Number, nullable: true },
        amount: { type: Number },
        providerPaymentId: { type: String },
        paymentStatus: { type: String },
        createdAt: { type: Date },
    },
});

const invoiceSchema = new EntitySchema({
    name: 'proforma_invoice',
    target: ProformaInvoice,
    columns: {
        id: { type: Number, primary: true, generated: true },
        number: { type: String },
        counterpartyId: { type: Number },
        orderId: { type: Number, nullable: true },
        branchId: { type: String, nullable: true },
        amount: { type: Number, default: 0 },
        status: { type: String, default: 'issued' },
        createdAt: { type: Date, nullable: true },
        dueDate: { type: Date, nullable: true },
    },
});

const counterpartySchema = new EntitySchema({
    name: 'counterparty',
    target: Counterparty,
    columns: {
        id: { type: Number, primary: true, generated: true },
        erpId: { type: String },
        shortName: { type: String, nullable: true },
        inn: { type: String, nullable: true },
        assignedManagerId: { type: String, nullable: true },
        branchId: { type: String, nullable: true },
    },
});

const { schema, extra } = testSchemaOptions('payment_list_filter_sort');
let dataSource: DataSource;
let service: PaymentVisibilityService;
let scope: AccessScope;
const ctx = {} as RequestContext;
const cps: Record<string, number> = {};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [paymentSchema, invoiceSchema, counterpartySchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE counterparty_team_member ("counterpartyId" varchar, "administratorId" varchar)`,
    );
    await dataSource.query(`CREATE TABLE trading_point (id serial, "servicingBranchId" varchar)`);
    await dataSource.query(
        `CREATE TABLE "order" (id serial PRIMARY KEY, code varchar, "customFieldsTradingpointid" varchar)`,
    );
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(entity as never),
    } as unknown as TransactionalConnection;
    const accessScope = new AccessScopeService({} as never, {} as never, {} as never);
    accessScope.resolveProformaInvoiceScope = async () => scope;
    const proformaVisibility = new ProformaInvoiceVisibilityService(connection, accessScope, {
        getGlobalDefaultBranchId: async () => 'branch-default',
    } as never);
    service = new PaymentVisibilityService(connection, proformaVisibility);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

// number, customer key, order code, amount, status, channel, created day
const ROWS: Array<[string, string, string, number, string, string, string]> = [
    ['2000', 'a', '1000', 5000, 'captured', 'online-acquiring', '2026-01-01'],
    ['2001', 'a', '1001', 90000, 'pending', 'branch-kassa', '2026-01-02'],
    ['2002', 'b', '1002', 25000, 'failed', 'online-acquiring', '2026-01-03'],
    ['2003', 'b', '1003', 700, 'refunded', 'bank-transfer-erp', '2026-01-04'],
    ['2004', 'hidden', '1004', 123, 'captured', 'online-acquiring', '2026-01-05'],
];

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE payment_attempt, proforma_invoice, counterparty, trading_point, "order", counterparty_team_member RESTART IDENTITY CASCADE',
    );
    for (const [key, name, inn, branch] of [
        ['a', 'Alpha Co', '1111', 'branch-a'],
        ['b', 'Beta Co', '2222', 'branch-a'],
        ['hidden', 'Hidden Co', '3333', 'branch-z'],
    ] as const) {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "shortName", inn, "branchId") VALUES ($1, $2, $3, $4) RETURNING id`,
            [`cp-${key}`, name, inn, branch],
        );
        cps[key] = row.id;
    }
    for (const [number, cp, code, amount, status, channel, created] of ROWS) {
        const [order]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO "order" (code) VALUES ($1) RETURNING id`,
            [code],
        );
        const [invoice]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO proforma_invoice (number, "counterpartyId", "orderId", amount, status, "branchId", "createdAt")
             VALUES ($1, $2, $3, $4, 'issued', 'branch-a', $5) RETURNING id`,
            [`${code}-01-1`, cps[cp], order.id, amount, created],
        );
        await dataSource.query(
            `INSERT INTO payment_attempt (number, channel, "proformaInvoiceId", "orderId", amount, "providerPaymentId", "paymentStatus", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [number, channel, invoice.id, order.id, amount, `ext-${number}`, status, created],
        );
    }
    scope = { kind: 'department', branchId: 'branch-a' } as AccessScope;
});

const numbers = async (options: PaymentListOptions): Promise<string[]> =>
    (await service.findVisible(ctx, options)).items.map(i => i.number);

describe('payment list filter and sort (real Postgres)', () => {
    it('keeps the scope: a hidden customer never appears, with or without a filter', async () => {
        expect((await numbers({ sort: { number: 'ASC' } })).includes('2004')).toBe(false);
        expect(await numbers({ filter: { number: { contains: '2004' } } })).toEqual([]);
        expect(await numbers({ filter: { customer: { eq: 'Hidden Co' } } })).toEqual([]);
        expect((await service.findVisible(ctx, { take: 0 })).totalItems).toBe(4);
    });

    it('sorts by every whitelisted field, newest first by default', async () => {
        expect(await numbers({})).toEqual(['2003', '2002', '2001', '2000']);
        expect(await numbers({ sort: { amount: 'ASC' } })).toEqual([
            '2003',
            '2000',
            '2002',
            '2001',
        ]);
        expect(await numbers({ sort: { customer: 'DESC', number: 'ASC' } })).toEqual([
            '2002',
            '2003',
            '2000',
            '2001',
        ]);
        expect((await numbers({ sort: { status: 'ASC' } }))[0]).toBe('2000');
        expect((await numbers({ sort: { channel: 'ASC', number: 'ASC' } }))[0]).toBe('2001');
        expect((await numbers({ sort: { createdAt: 'ASC' } }))[0]).toBe('2000');
    });

    it('filters by number, amount, date, status, channel, customer, proforma and order', async () => {
        expect(await numbers({ filter: { number: { contains: '2001' } } })).toEqual(['2001']);
        expect(
            await numbers({
                filter: { amount: { between: { start: 1000, end: 30000 } } },
                sort: { number: 'ASC' },
            }),
        ).toEqual(['2000', '2002']);
        expect(
            await numbers({ filter: { createdAt: { after: '2026-01-02T12:00:00.000Z' } } }),
        ).toEqual(['2003', '2002']);
        expect(await numbers({ filter: { status: { eq: 'pending' } } })).toEqual(['2001']);
        expect(
            await numbers({
                filter: { channel: { eq: 'online-acquiring' } },
                sort: { number: 'ASC' },
            }),
        ).toEqual(['2000', '2002']);
        expect(
            await numbers({ filter: { customer: { contains: 'beta' } }, sort: { number: 'ASC' } }),
        ).toEqual(['2002', '2003']);
        expect(await numbers({ filter: { orderCode: { eq: '1002' } } })).toEqual(['2002']);
        expect(await numbers({ filter: { proformaInvoiceNumber: { eq: '1003-01-1' } } })).toEqual([
            '2003',
        ]);
        expect(
            await numbers({
                filter: { _or: [{ amount: { lt: 1000 } }, { customerInn: { eq: '1111' } }] },
                sort: { number: 'ASC' },
            }),
        ).toEqual(['2000', '2001', '2003']);
    });

    it('keeps rows with a NULL value for notEq and notIn', async () => {
        await dataSource.query(`UPDATE counterparty SET inn = NULL WHERE "erpId" = 'cp-a'`);
        expect(
            await numbers({ filter: { customerInn: { notEq: '2222' } }, sort: { number: 'ASC' } }),
        ).toEqual(['2000', '2001']);
        expect(
            await numbers({
                filter: { customerInn: { notIn: ['2222'] } },
                sort: { number: 'ASC' },
            }),
        ).toEqual(['2000', '2001']);
    });

    it('search matches number, customer and INN; counts follow the same filters', async () => {
        expect(await numbers({ search: 'Alpha', sort: { number: 'ASC' } })).toEqual([
            '2000',
            '2001',
        ]);
        expect(await numbers({ search: '2222', sort: { number: 'ASC' } })).toEqual([
            '2002',
            '2003',
        ]);
        const filter = { customer: { contains: 'Beta' } };
        expect(await numbers({ filter, status: 'failed' })).toEqual(['2002']);
        expect(await numbers({ filter, search: 'Alpha' })).toEqual([]);
        expect((await service.findVisible(ctx, { filter, take: 0 })).totalItems).toBe(2);
        const page = await service.findVisible(ctx, { filter, take: 1, skip: 1 });
        expect(page.totalItems).toBe(2);
        expect(page.items).toHaveLength(1);
    });

    it('attaches customer name, proforma number and order code to each row', async () => {
        const [row] = (await service.findVisible(ctx, { filter: { number: { eq: '2002' } } }))
            .items;
        expect(row).toMatchObject({
            counterpartyShortName: 'Beta Co',
            proformaInvoiceNumber: '1002-01-1',
            orderCode: '1002',
        });
    });

    it('treats hostile values as data and rejects unknown fields', async () => {
        expect(
            await numbers({ filter: { number: { contains: "'; DROP TABLE payment_attempt;--" } } }),
        ).toEqual([]);
        expect((await service.findVisible(ctx, { take: 0 })).totalItems).toBe(4);
        await expect(
            service.findVisible(ctx, { filter: { 'number"; --': { eq: 'x' } } }),
        ).rejects.toThrow();
        await expect(service.findVisible(ctx, { sort: { orderCode: 'ASC' } })).rejects.toThrow();
    });
});
