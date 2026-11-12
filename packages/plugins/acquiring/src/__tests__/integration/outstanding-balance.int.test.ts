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
        amount: { type: Number, default: 0 },
        currencyCode: { type: String, default: 'RUB' },
        kind: { type: String, default: 'order' },
        status: { type: String, default: 'issued' },
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

const { schema, extra } = testSchemaOptions('outstanding_balance');
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

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE proforma_invoice, counterparty, trading_point, "order", counterparty_team_member RESTART IDENTITY CASCADE',
    );
    for (const [key, branch] of [
        ['visible', 'branch-a'],
        ['other', 'branch-a'],
        ['hidden', 'branch-z'],
    ] as const) {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "shortName", "branchId") VALUES ($1, $1, $2) RETURNING id`,
            [`cp-${key}`, branch],
        );
        cps[key] = row.id;
    }
    scope = { kind: 'all' } as AccessScope;
});

let seq = 0;
async function addInvoice(
    cp: string,
    amount: number,
    opts: { status?: string; kind?: string; currency?: string; branch?: string } = {},
): Promise<void> {
    const [order]: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO "order" (code) VALUES ($1) RETURNING id`,
        [`order-${++seq}`],
    );
    await dataSource.query(
        `INSERT INTO proforma_invoice (number, "counterpartyId", "orderId", amount, "currencyCode", kind, status, "branchId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            `${seq}-01-1`,
            cps[cp],
            order.id,
            amount,
            opts.currency ?? 'RUB',
            opts.kind ?? 'order',
            opts.status ?? 'issued',
            opts.branch ?? 'branch-a',
        ],
    );
}

describe('getOutstandingBalance (real Postgres, summed in SQL)', () => {
    it('returns null when the counterparty has no open invoice', async () => {
        expect(await service.getOutstandingBalance(ctx, String(cps.visible))).toBeNull();
    });

    it('sums several pending and issued invoices of the counterparty only', async () => {
        await addInvoice('visible', 101, { status: 'pending' });
        await addInvoice('visible', 200, { status: 'issued' });
        await addInvoice('other', 9999);

        expect(await service.getOutstandingBalance(ctx, String(cps.visible))).toEqual({
            amount: 301,
            currencyCode: 'RUB',
        });
    });

    it('ignores paid, cancelled and superseded invoices', async () => {
        await addInvoice('visible', 100, { status: 'paid' });
        await addInvoice('visible', 100, { status: 'cancelled' });
        await addInvoice('visible', 100, { status: 'superseded' });

        expect(await service.getOutstandingBalance(ctx, String(cps.visible))).toBeNull();
    });

    it('excludes contract payment kinds', async () => {
        await addInvoice('visible', 50);
        await addInvoice('visible', 1000, { kind: 'advance' });
        await addInvoice('visible', 2000, { kind: 'debt-repayment' });

        expect(await service.getOutstandingBalance(ctx, String(cps.visible))).toEqual({
            amount: 50,
            currencyCode: 'RUB',
        });
    });

    it('respects the caller scope: a counterparty outside the branch reads as no balance', async () => {
        await addInvoice('hidden', 700, { branch: 'branch-z' });
        scope = { kind: 'department', branchId: 'branch-a' } as AccessScope;

        expect(await service.getOutstandingBalance(ctx, String(cps.hidden))).toBeNull();
    });

    it('mixed currencies report the smallest currency code (MIN), deterministically, with all amounts summed', async () => {
        await addInvoice('visible', 10, { currency: 'USD' });
        await addInvoice('visible', 20, { currency: 'EUR' });
        await addInvoice('visible', 30, { currency: 'RUB' });

        expect(await service.getOutstandingBalance(ctx, String(cps.visible))).toEqual({
            amount: 60,
            currencyCode: 'EUR',
        });
    });
});
