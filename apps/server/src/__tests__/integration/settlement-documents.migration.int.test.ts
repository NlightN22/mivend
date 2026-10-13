import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { SettlementDocuments1791498000000 } from '../../migrations/1791498000000-settlement-documents';

const { schema, extra } = testSchemaOptions('settlement_documents_migration');
let dataSource: DataSource;

async function run(direction: 'up' | 'down'): Promise<void> {
    const qr = dataSource.createQueryRunner();
    try {
        await new SettlementDocuments1791498000000()[direction](qr);
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
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        `CREATE TABLE IF NOT EXISTS "global_settings" ("id" serial primary key)`,
    );
    await run('down');
    await dataSource.query(`TRUNCATE "global_settings"`);
    await run('up');
});

const insertDocument = (erpId: string): Promise<unknown> =>
    dataSource.query(
        `INSERT INTO "settlement_document" ("erpId", "documentType", "documentTypeLabel", "number", "date", "sourceVersion")
         VALUES ($1, 'Sale', 'Sale', '7', now(), '1')`,
        [erpId],
    );

describe('SettlementDocuments migration (integration, real Postgres)', () => {
    it('is idempotent', async () => {
        await run('up');
        await run('up');
    });

    it('enforces a unique document uuid but not a unique number', async () => {
        await insertDocument('d1');
        await insertDocument('d2');

        await expect(insertDocument('d1')).rejects.toThrow();
    });

    it('cascades entries and order links when a document is removed', async () => {
        await insertDocument('d1');
        await dataSource.query(
            `INSERT INTO "settlement_document_entry"
               ("documentId", "organizationErpId", "counterpartyErpId", "contractErpId", "currency", "amountMinor")
             VALUES (1, 'o', 'c', 'k', 'RUB', 100)`,
        );
        await dataSource.query(
            `INSERT INTO "settlement_order_link" ("entryId", "orderErpId", "amountMinor") VALUES (1, 'x', 100)`,
        );

        await dataSource.query(`DELETE FROM "settlement_document"`);

        const links = await dataSource.query(`SELECT 1 FROM "settlement_order_link"`);
        expect(links).toHaveLength(0);
    });

    it('enforces a unique balance key and adds the retention setting with its default', async () => {
        const insert = (): Promise<unknown> =>
            dataSource.query(
                `INSERT INTO "settlement_balance"
                   ("balanceKey", "organizationErpId", "counterpartyErpId", "contractErpId", "currency",
                    "openingBalance", "closingBalance", "sourceVersion")
                 VALUES ('a:b:c', 'a', 'b', 'c', 'RUB', 0, 0, '1')`,
            );
        await insert();
        await expect(insert()).rejects.toThrow();

        await dataSource.query(`INSERT INTO "global_settings" DEFAULT VALUES`);
        const [row] = await dataSource.query(
            `SELECT "customFieldsSettlementretentionmonths" AS months FROM "global_settings"`,
        );
        expect(row.months).toBe(12);
    });
});
