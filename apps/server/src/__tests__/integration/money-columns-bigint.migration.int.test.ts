import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { MoneyColumnsBigint1791605000000 } from '../../migrations/1791605000000-money-columns-bigint';

const { schema, extra } = testSchemaOptions('money_columns_bigint_migration');
let dataSource: DataSource;

async function run(direction: 'up' | 'down'): Promise<void> {
    const qr = dataSource.createQueryRunner();
    try {
        await new MoneyColumnsBigint1791605000000()[direction](qr);
    } finally {
        await qr.release();
    }
}

const typeOf = async (table: string, column: string): Promise<string> =>
    (
        await dataSource.query(
            `SELECT data_type FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
            [table, column],
        )
    )[0].data_type;

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
    await dataSource.query(`DROP TABLE IF EXISTS "order", refund, other`);
    await dataSource.query(
        `CREATE TABLE "order" (id serial PRIMARY KEY, "subTotal" integer NOT NULL,
         "subTotalWithTax" integer NOT NULL, shipping integer NOT NULL DEFAULT 0,
         "shippingWithTax" integer NOT NULL DEFAULT 0)`,
    );
    await dataSource.query(
        `CREATE TABLE refund (id serial PRIMARY KEY, items integer NOT NULL, total integer NOT NULL)`,
    );
    await dataSource.query(`CREATE TABLE other (id serial PRIMARY KEY, "subTotal" integer)`);
});

describe('money columns bigint migration (real Postgres)', () => {
    it('widens listed columns, tolerates absent tables, leaves unlisted ones, is idempotent', async () => {
        await run('up');
        await run('up');

        expect(await typeOf('order', 'subTotal')).toBe('bigint');
        expect(await typeOf('order', 'shippingWithTax')).toBe('bigint');
        expect(await typeOf('refund', 'total')).toBe('bigint');
        expect(await typeOf('other', 'subTotal')).toBe('integer');
        await dataSource.query(
            `INSERT INTO "order" ("subTotal", "subTotalWithTax") VALUES (20937559780, 24844262039)`,
        );
    });

    it('down restores integer and refuses values that no longer fit', async () => {
        await run('up');
        await run('down');
        expect(await typeOf('order', 'subTotal')).toBe('integer');

        await run('up');
        await dataSource.query(
            `INSERT INTO "order" ("subTotal", "subTotalWithTax") VALUES (20937559780, 1)`,
        );
        await expect(run('down')).rejects.toThrow(/out of range/);
    });
});
