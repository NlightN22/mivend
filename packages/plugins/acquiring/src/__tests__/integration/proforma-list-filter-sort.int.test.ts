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

import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { ProformaInvoiceVisibilityService } from '../../proforma-invoice-visibility.service';
import type { ProformaInvoiceListOptions } from '../../proforma-invoice.service';

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
        createdAt: { type: Date },
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

const { schema, extra } = testSchemaOptions('proforma_list_filter_sort');
let dataSource: DataSource;
let service: ProformaInvoiceVisibilityService;
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
        entities: [invoiceSchema, counterpartySchema],
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
    service = new ProformaInvoiceVisibilityService(connection, accessScope, {
        getGlobalDefaultBranchId: async () => 'branch-default',
    } as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

// number, customer key, order code, amount, stored status, created day, due day
const ROWS: Array<[string, string, string, number, string, string, string]> = [
    ['1000-01-1', 'a', '1000', 5000, 'issued', '2026-01-01', '2026-01-08'],
    ['1001-01-1', 'a', '1001', 90000, 'paid', '2026-01-02', '2026-01-09'],
    ['1002-01-1', 'b', '1002', 25000, 'superseded', '2026-01-03', '2026-01-10'],
    ['1003-01-1', 'b', '1003', 700, 'cancelled', '2026-01-04', '2026-01-11'],
    ['1004-01-1', 'hidden', '1004', 123, 'issued', '2026-01-05', '2026-01-12'],
];

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE proforma_invoice, counterparty, trading_point, "order", counterparty_team_member RESTART IDENTITY CASCADE',
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
    for (const [number, cp, code, amount, status, created, due] of ROWS) {
        const [order]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO "order" (code) VALUES ($1) RETURNING id`,
            [code],
        );
        await dataSource.query(
            `INSERT INTO proforma_invoice (number, "counterpartyId", "orderId", amount, status, "createdAt", "dueDate", "branchId")
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'branch-a')`,
            [number, cps[cp], order.id, amount, status, created, due],
        );
    }
    scope = { kind: 'department', branchId: 'branch-a' } as AccessScope;
});

const numbers = async (options: ProformaInvoiceListOptions): Promise<string[]> =>
    (await service.findVisible(ctx, options)).items.map(i => i.number);

describe('proforma list filter and sort (real Postgres)', () => {
    it('keeps the scope: a hidden customer never appears, with or without a filter', async () => {
        expect((await numbers({ sort: { number: 'ASC' } })).includes('1004-01-1')).toBe(false);
        expect(await numbers({ filter: { number: { contains: '1004' } } })).toEqual([]);
        expect(await numbers({ filter: { customer: { eq: 'Hidden Co' } } })).toEqual([]);
    });

    it('sorts by every whitelisted field with an id tiebreaker', async () => {
        expect(await numbers({ sort: { amount: 'ASC' } })).toEqual([
            '1003-01-1',
            '1000-01-1',
            '1002-01-1',
            '1001-01-1',
        ]);
        expect(await numbers({ sort: { customer: 'DESC', number: 'ASC' } })).toEqual([
            '1002-01-1',
            '1003-01-1',
            '1000-01-1',
            '1001-01-1',
        ]);
        expect((await numbers({ sort: { status: 'ASC', number: 'ASC' } }))[0]).toBe('1003-01-1');
        expect((await numbers({ sort: { dueDate: 'DESC' } }))[0]).toBe('1003-01-1');
        expect((await numbers({ sort: { createdAt: 'ASC' } }))[0]).toBe('1000-01-1');
        expect((await numbers({}))[0]).toBe('1003-01-1');
    });

    it('filters by string, number, date, status, customer and order code', async () => {
        expect(await numbers({ filter: { number: { contains: '1001' } } })).toEqual(['1001-01-1']);
        expect(
            await numbers({
                filter: { amount: { between: { start: 1000, end: 30000 } } },
                sort: { number: 'ASC' },
            }),
        ).toEqual(['1000-01-1', '1002-01-1']);
        expect(
            await numbers({
                filter: { createdAt: { after: '2026-01-02T12:00:00.000Z' } },
            }),
        ).toEqual(['1003-01-1', '1002-01-1']);
        expect(
            await numbers({ filter: { status: { eq: 'current' } }, sort: { number: 'ASC' } }),
        ).toEqual(['1000-01-1', '1001-01-1']);
        expect(
            await numbers({ filter: { customer: { contains: 'beta' } }, sort: { number: 'ASC' } }),
        ).toEqual(['1002-01-1', '1003-01-1']);
        expect(await numbers({ filter: { orderCode: { eq: '1002' } } })).toEqual(['1002-01-1']);
        expect(
            await numbers({
                filter: { _or: [{ amount: { lt: 1000 } }, { customerInn: { eq: '1111' } }] },
                sort: { number: 'ASC' },
            }),
        ).toEqual(['1000-01-1', '1001-01-1', '1003-01-1']);
    });

    it('keeps rows with a NULL value for notEq and notIn', async () => {
        await dataSource.query(`UPDATE counterparty SET inn = NULL WHERE "erpId" = 'cp-a'`);
        expect(
            await numbers({ filter: { customerInn: { notEq: '2222' } }, sort: { number: 'ASC' } }),
        ).toEqual(['1000-01-1', '1001-01-1']);
        expect(
            await numbers({
                filter: { customerInn: { notIn: ['2222'] } },
                sort: { number: 'ASC' },
            }),
        ).toEqual(['1000-01-1', '1001-01-1']);
    });

    it('combines with search and the status option; counts follow the same filters', async () => {
        const filter = { customer: { contains: 'Beta' } };
        expect(await numbers({ filter, status: 'cancelled' })).toEqual(['1003-01-1']);
        expect(await numbers({ filter, search: 'Alpha' })).toEqual([]);
        const counts = await service.findVisible(ctx, { filter, take: 0 });
        expect(counts.totalItems).toBe(2);
    });

    it('treats hostile values as data and rejects unknown fields', async () => {
        expect(
            await numbers({
                filter: { number: { contains: "'; DROP TABLE proforma_invoice;--" } },
            }),
        ).toEqual([]);
        expect((await service.findVisible(ctx, { take: 0 })).totalItems).toBe(4);
        await expect(
            service.findVisible(ctx, { filter: { 'number"; --': { eq: 'x' } } }),
        ).rejects.toThrow();
        await expect(service.findVisible(ctx, { sort: { orderCode: 'ASC' } })).rejects.toThrow();
    });
});
