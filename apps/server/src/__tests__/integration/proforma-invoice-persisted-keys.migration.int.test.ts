import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ProformaInvoicePersistedKeys1791490000000 } from '../../migrations/1791490000000-proforma-invoice-persisted-keys';

const { schema, extra } = testSchemaOptions('proforma_keys_migration');
let dataSource: DataSource;

async function up(): Promise<void> {
    const qr = dataSource.createQueryRunner();
    try {
        await new ProformaInvoicePersistedKeys1791490000000().up(qr);
    } finally {
        await qr.release();
    }
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE "document" ("id" serial primary key, "type" text)`);
    await dataSource.query(`CREATE TABLE "role" ("code" text primary key, "permissions" text)`);
    await dataSource.query(
        `CREATE TABLE "role_access_scope" ("roleCode" text primary key, "accessScopeConfig" text)`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(`TRUNCATE "document", "role", "role_access_scope"`);
    await dataSource.query(`DROP SEQUENCE IF EXISTS "mivend_number_seq_proforma_invoice"`);
    await dataSource.query(`DROP SEQUENCE IF EXISTS "mivend_number_seq_invoice"`);
    await dataSource.query(`CREATE SEQUENCE "mivend_number_seq_invoice"`);
});

describe('ProformaInvoicePersistedKeys migration (integration, real Postgres)', () => {
    it('rewrites only the exact ReadInvoice permission token', async () => {
        await dataSource.query(
            `INSERT INTO "role" VALUES ('a', 'ReadOrder,ReadInvoice,ReadInvoiceX,XReadInvoice,ReadInvoices')`,
        );
        await up();
        const [row] = await dataSource.query(`SELECT "permissions" FROM "role"`);
        expect(row.permissions).toBe(
            'ReadOrder,ReadProformaInvoice,ReadInvoiceX,XReadInvoice,ReadInvoices',
        );
    });

    it('renames the access-scope key but never a value equal to "invoice"', async () => {
        const config = JSON.stringify({
            invoice: { mode: 'own' },
            label: 'invoice',
            note: 'invoice',
        });
        await dataSource.query(`INSERT INTO "role_access_scope" VALUES ('a', $1)`, [config]);
        await up();
        const [row] = await dataSource.query(`SELECT "accessScopeConfig" FROM "role_access_scope"`);
        expect(JSON.parse(row.accessScopeConfig)).toEqual({
            proformaInvoice: { mode: 'own' },
            label: 'invoice',
            note: 'invoice',
        });
    });

    it('renames document type and sequence, and a second up() is a no-op', async () => {
        await dataSource.query(`INSERT INTO "document" ("type") VALUES ('invoice'), ('order')`);
        await up();
        await up();
        const rows = await dataSource.query(`SELECT "type" FROM "document" ORDER BY "id"`);
        expect(rows.map((r: { type: string }) => r.type)).toEqual(['proforma-invoice', 'order']);
        const seq = await dataSource.query(
            `SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'mivend_number_seq_proforma_invoice'`,
        );
        expect(seq).toHaveLength(1);
    });
});
