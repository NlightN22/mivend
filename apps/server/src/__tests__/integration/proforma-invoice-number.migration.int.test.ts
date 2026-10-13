import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ProformaInvoiceNumberDatesKind1791501000000 } from '../../migrations/1791501000000-proforma-invoice-number-dates-kind';

const { schema, extra } = testSchemaOptions('proforma_number_migration');
let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE "branch_settings" ("id" serial primary key)`);
    await dataSource.query(
        `CREATE TABLE "proforma_invoice" ("id" serial primary key, "createdAt" timestamptz NOT NULL DEFAULT now(),
         "orderId" int NOT NULL, "organizationId" int NOT NULL, "number" varchar NOT NULL, "version" int NOT NULL DEFAULT 1,
         "status" varchar NOT NULL DEFAULT 'issued')`,
    );
    await dataSource.query(
        `CREATE TABLE "document" ("id" serial primary key, "type" varchar NOT NULL, "proformaInvoiceId" varchar, "number" varchar NOT NULL)`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('ProformaInvoiceNumberDatesKind migration (integration, real Postgres)', () => {
    it('renumbers to <order>-<NN of v1>-<version>, syncs documents, backfills dates and kind', async () => {
        await dataSource.query(
            `INSERT INTO "proforma_invoice" ("orderId","organizationId","number","version") VALUES
             (7,1,'1000007-01',1),(7,2,'1000007-02',1),(7,1,'1000007-03',2),(8,1,'1000008-01',1)`,
        );
        await dataSource.query(
            `INSERT INTO "document" ("type","proformaInvoiceId","number") VALUES
             ('proforma-invoice','3','1000007-03'),('contract',NULL,'CTR-1')`,
        );
        const qr = dataSource.createQueryRunner();
        await new ProformaInvoiceNumberDatesKind1791501000000().up(qr);
        await new ProformaInvoiceNumberDatesKind1791501000000().up(qr);
        await qr.release();

        const rows: { number: string; kind: string; days: number }[] = await dataSource.query(
            `SELECT "number","kind", EXTRACT(DAY FROM "dueDate" - "issuedAt")::int AS days FROM "proforma_invoice" ORDER BY "id"`,
        );
        expect(rows.map(r => r.number)).toEqual([
            '1000007-01-1',
            '1000007-02-1',
            '1000007-01-2',
            '1000008-01-1',
        ]);
        expect(rows.map(r => r.kind)).toEqual([
            'order-placed',
            'order-placed',
            'order-changed',
            'order-placed',
        ]);
        expect(rows.every(r => r.days === 3)).toBe(true);
        const docs: { number: string }[] = await dataSource.query(
            `SELECT "number" FROM "document" ORDER BY "id"`,
        );
        expect(docs.map(d => d.number)).toEqual(['1000007-01-2', 'CTR-1']);
    });

    it('handles an absent or cancelled v1, two organizations, and numbers that are already new', async () => {
        await dataSource.query(
            `INSERT INTO "proforma_invoice" ("orderId","organizationId","number","version","status") VALUES
             (21,1,'1000021-05',2,'issued'),
             (22,1,'1000022-01',1,'cancelled'),(22,1,'1000022-01',2,'issued'),
             (22,2,'1000022-02',1,'issued'),
             (23,1,'1000023-01-1',1,'issued'),(23,2,'1000023-02',1,'issued')`,
        );
        const qr = dataSource.createQueryRunner();
        const migration = new ProformaInvoiceNumberDatesKind1791501000000();
        await migration.up(qr);
        await migration.up(qr);
        await qr.release();

        const rows: { orderId: number; number: string }[] = await dataSource.query(
            `SELECT "orderId","number" FROM "proforma_invoice" WHERE "orderId" >= 21 ORDER BY "id"`,
        );
        expect(rows.map(r => r.number)).toEqual([
            '1000021-05-2',
            '1000022-01-1',
            '1000022-01-2',
            '1000022-02-1',
            '1000023-01-1',
            '1000023-02-1',
        ]);
        const unique = new Set(rows.map(r => r.number));
        expect(unique.size).toBe(rows.length);
    });
});
