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

const invoiceSchema = new EntitySchema({
    name: 'proforma_invoice',
    target: ProformaInvoice,
    columns: {
        id: { type: Number, primary: true, generated: true },
        number: { type: String },
        counterpartyId: { type: Number },
        orderId: { type: Number, nullable: true },
        branchId: { type: String, nullable: true },
        createdAt: { type: Date, createDate: true },
    },
});

const counterpartySchema = new EntitySchema({
    name: 'counterparty',
    target: Counterparty,
    columns: {
        id: { type: Number, primary: true, generated: true },
        erpId: { type: String },
        shortName: { type: String, nullable: true },
        assignedManagerId: { type: String, nullable: true },
        branchId: { type: String, nullable: true },
    },
});

const { schema, extra } = testSchemaOptions('proforma_read_time_branch');
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
        `CREATE TABLE "order" (id serial PRIMARY KEY, "customFieldsTradingpointid" varchar)`,
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

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE proforma_invoice, counterparty, trading_point, "order", counterparty_team_member RESTART IDENTITY CASCADE',
    );
    for (const [key, branch] of [
        ['a', 'branch-a'],
        ['none', null],
    ] as const) {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "shortName", "assignedManagerId", "branchId") VALUES ($1, $2, $3, $4) RETURNING id`,
            [`cp-${key}`, `Short ${key}`, `m-${key}`, branch],
        );
        cps[key] = row.id;
    }
    await dataSource.query(
        `INSERT INTO trading_point ("servicingBranchId") VALUES ('branch-b'), (NULL);
         INSERT INTO "order" ("customFieldsTradingpointid") VALUES ('1'), ('2'), (NULL)`,
    );
    const invoices: Array<[string, number, number | null, string | null]> = [
        ['PI-POINT-B', cps.a, 1, 'branch-a'],
        ['PI-POINT-NONE', cps.a, 2, null],
        ['PI-CONTRACT', cps.a, null, 'branch-b'],
        ['PI-DEFAULT', cps.none, 3, null],
    ];
    for (const [number, counterpartyId, orderId, branchId] of invoices) {
        await dataSource.query(
            `INSERT INTO proforma_invoice (number, "counterpartyId", "orderId", "branchId") VALUES ($1, $2, $3, $4)`,
            [number, counterpartyId, orderId, branchId],
        );
    }
});

const visibleFor = async (branchId: string): Promise<string[]> => {
    scope = { kind: 'department', branchId } as AccessScope;
    return (await service.findVisible(ctx)).items.map(i => i.number).sort();
};

describe('proforma branch resolved at read time for department scope (#263, real Postgres)', () => {
    it("the order's trading point servicing branch overrides the counterparty branch", async () => {
        expect(await visibleFor('branch-b')).toEqual(['PI-POINT-B']);
    });

    it('falls back to the counterparty branch, including contract proformas without an order', async () => {
        expect(await visibleFor('branch-a')).toEqual(['PI-CONTRACT', 'PI-POINT-NONE']);
    });

    it('falls back to the global default branch when neither is set', async () => {
        expect(await visibleFor('branch-default')).toEqual(['PI-DEFAULT']);
    });

    it('a proforma moves with its counterparty, ignoring the issue-time snapshot', async () => {
        await dataSource.query(`UPDATE counterparty SET "branchId" = 'branch-c' WHERE id = $1`, [
            cps.a,
        ]);
        expect(await visibleFor('branch-c')).toEqual(['PI-CONTRACT', 'PI-POINT-NONE']);
        expect(await visibleFor('branch-a')).toEqual([]);
    });

    it("also lists the caller's own clients regardless of branch (manager union)", async () => {
        scope = {
            kind: 'department',
            branchId: 'branch-b',
            administratorId: 'm-none',
        } as AccessScope;
        const numbers = (await service.findVisible(ctx)).items.map(i => i.number).sort();
        expect(numbers).toEqual(['PI-DEFAULT', 'PI-POINT-B']);
    });

    it('pages newest first with a total that ignores skip/take, and carries the counterparty short name', async () => {
        scope = { kind: 'department', branchId: 'branch-a' } as AccessScope;

        const page = await service.findVisible(ctx, { skip: 1, take: 1 });

        expect(page.totalItems).toBe(2);
        expect(page.items.map(i => i.number)).toEqual(['PI-POINT-NONE']);
        expect(page.items[0].counterpartyShortName).toBe('Short a');
    });

    it('take 0 returns only the scoped total', async () => {
        scope = { kind: 'department', branchId: 'branch-a' } as AccessScope;

        expect(await service.findVisible(ctx, { take: 0 })).toEqual({ items: [], totalItems: 2 });
    });

    it('all scope returns every proforma without branch joins affecting the count', async () => {
        scope = { kind: 'all' } as AccessScope;

        const page = await service.findVisible(ctx, { take: 10 });

        expect(page.totalItems).toBe(4);
        expect(page.items.map(i => i.id)).toEqual([4, 3, 2, 1]);
    });
});

describe('findOneVisible uses the same read-time scope as the list (real Postgres)', () => {
    const idOf = async (number: string): Promise<string> => {
        const [row]: Array<{ id: number }> = await dataSource.query(
            'SELECT id FROM proforma_invoice WHERE number = $1',
            [number],
        );
        return String(row.id);
    };

    it('returns a visible proforma with its counterparty short name', async () => {
        scope = { kind: 'department', branchId: 'branch-b' } as AccessScope;
        const found = await service.findOneVisible(ctx, await idOf('PI-POINT-B'));
        expect(found?.number).toBe('PI-POINT-B');
        expect(found?.counterpartyShortName).toBe('Short a');
    });

    it('a hidden, unknown and malformed id are all null', async () => {
        scope = { kind: 'department', branchId: 'branch-b' } as AccessScope;
        expect(await service.findOneVisible(ctx, await idOf('PI-DEFAULT'))).toBeNull();
        expect(await service.findOneVisible(ctx, '99999')).toBeNull();
        expect(await service.findOneVisible(ctx, '1; DROP TABLE x')).toBeNull();
    });

    it('all scope sees a contract proforma that has no order', async () => {
        scope = { kind: 'all' } as AccessScope;
        expect((await service.findOneVisible(ctx, await idOf('PI-CONTRACT')))?.number).toBe(
            'PI-CONTRACT',
        );
    });
});
