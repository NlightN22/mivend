import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderExternalAndCounterparty1791496000000 } from '../../migrations/1791496000000-order-external-and-counterparty';

const { schema, extra } = testSchemaOptions('order_external_migration');
let dataSource: DataSource;

async function up(): Promise<void> {
    const qr = dataSource.createQueryRunner();
    try {
        await new OrderExternalAndCounterparty1791496000000().up(qr);
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
    await dataSource.query(`DROP TABLE IF EXISTS "order", "customer"`);
    await dataSource.query(
        `CREATE TABLE "customer" ("id" serial primary key, "customFieldsCounterpartyid" varchar(255))`,
    );
    await dataSource.query(
        `CREATE TABLE "order" ("id" serial primary key, "customerId" int, "customFieldsErporderid" varchar(255))`,
    );
});

describe('OrderExternalAndCounterparty migration (integration, real Postgres)', () => {
    it("backfills counterpartyId from the customer's counterparty and leaves others empty", async () => {
        await dataSource.query(
            `INSERT INTO "customer" ("customFieldsCounterpartyid") VALUES ('11'), (NULL)`,
        );
        await dataSource.query(`INSERT INTO "order" ("customerId") VALUES (1), (2), (NULL)`);

        await up();

        const rows = await dataSource.query(
            `SELECT "customFieldsCounterpartyid" AS cp, "customFieldsIsexternal" AS ext
             FROM "order" ORDER BY id`,
        );
        expect(rows).toEqual([
            { cp: '11', ext: false },
            { cp: null, ext: false },
            { cp: null, ext: false },
        ]);
    });

    it('is idempotent and enforces a unique erpOrderId', async () => {
        await up();
        await up();
        await dataSource.query(
            `INSERT INTO "order" ("customFieldsErporderid") VALUES ('e1'), (NULL), (NULL)`,
        );
        await expect(
            dataSource.query(`INSERT INTO "order" ("customFieldsErporderid") VALUES ('e1')`),
        ).rejects.toThrow();
    });

    it('refuses to build the unique index over duplicate erpOrderIds and names them', async () => {
        await dataSource.query(
            `INSERT INTO "order" ("customFieldsErporderid") VALUES ('dup-1'), ('dup-1'), ('ok')`,
        );

        await expect(up()).rejects.toThrow(/duplicates exist: dup-1 \(x2\)/);
    });

    it('builds a partial index so empty erpOrderIds never conflict', async () => {
        await up();

        const [row] = await dataSource.query(
            `SELECT indexdef FROM pg_indexes WHERE indexname = 'IDX_order_custom_fields_erporderid'
               AND schemaname = $1`,
            [schema],
        );
        expect(row.indexdef).toMatch(/WHERE .*IS NOT NULL/);
    });
});
