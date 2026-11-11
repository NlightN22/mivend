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
        status: { type: String, nullable: true },
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
        legalName: { type: String, nullable: true },
        inn: { type: String, nullable: true },
        branchId: { type: String, nullable: true },
    },
});

const { schema, extra } = testSchemaOptions('proforma_search');
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

const searchable = async (term: string, limit = 10): Promise<string[]> =>
    (await service.searchByNumber(ctx, term, limit)).map(i => i.number).sort();

describe('proforma global search by number (real Postgres)', () => {
    it.each([
        ['department', { kind: 'department', branchId: 'branch-a' }],
        ['department of another branch', { kind: 'department', branchId: 'branch-b' }],
        ['department without a branch', { kind: 'department', branchId: null }],
        ['own', { kind: 'own', administratorId: 'm-a', grantedManagerIds: [] }],
        ['all', { kind: 'all' }],
    ])('finds exactly what the list shows: %s scope', async (_name, value) => {
        scope = value as AccessScope;
        const listed = (await service.findVisible(ctx)).items.map(i => i.number).sort();
        expect(await searchable('PI-')).toEqual(listed);
    });

    it('returns the counterparty and the status of a hit', async () => {
        scope = { kind: 'all' } as AccessScope;
        await dataSource.query(
            `UPDATE proforma_invoice SET status = 'issued' WHERE number = 'PI-CONTRACT'`,
        );
        const [hit] = await service.searchByNumber(ctx, 'pi-contract', 5);
        expect(hit).toMatchObject({
            number: 'PI-CONTRACT',
            status: 'issued',
            counterpartyShortName: 'Short a',
            counterpartyId: cps.a,
        });
    });

    it('matches case-insensitively, applies the limit and escapes wildcards', async () => {
        scope = { kind: 'all' } as AccessScope;
        expect(await searchable('pi-point')).toEqual(['PI-POINT-B', 'PI-POINT-NONE']);
        expect(await searchable('PI-', 2)).toHaveLength(2);
        expect(await searchable('PI_')).toEqual([]);
        expect(await searchable('%')).toEqual([]);
    });
});
