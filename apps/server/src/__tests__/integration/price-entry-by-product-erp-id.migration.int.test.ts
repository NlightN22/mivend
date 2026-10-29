import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { PriceEntryByProductErpId1791540000000 } from '../../migrations/1791540000000-price-entry-by-product-erp-id';

const { schema, extra } = testSchemaOptions('price_entry_by_product_migration');
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
    await dataSource.query(
        `CREATE TABLE "product" ("id" serial primary key, "customFieldsExternalid" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE "product_variant" ("id" serial primary key, "productId" int)`,
    );
    await dataSource.query(`CREATE TABLE "product_variant_price_entry" (
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "variantId" character varying NOT NULL, "priceTypeCode" character varying NOT NULL,
        "price" bigint NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_df59042fb6655b0a344f485854e" PRIMARY KEY ("id"))`);
    await dataSource.query(
        `CREATE UNIQUE INDEX "IDX_94d191d8ddc46b70764a3ab283" ON "product_variant_price_entry" ("variantId", "priceTypeCode")`,
    );
    await dataSource.query(
        `INSERT INTO product ("customFieldsExternalid") VALUES ('erp-1'), (NULL), ('erp-3'), ('erp-5')`,
    );
    await dataSource.query(
        `INSERT INTO product_variant ("productId") VALUES (1), (2), (3), (3), (4), (4)`,
    );
    // erp-3: the lower id carries the newer updatedAt and must win; erp-5: equal updatedAt, higher id wins.
    await dataSource.query(`INSERT INTO product_variant_price_entry ("variantId", "priceTypeCode", price, "updatedAt") VALUES
        ('1', 'RETAIL', 100, now()), ('1', 'WHOLESALE', 90, now()), ('2', 'RETAIL', 50, now()),
        ('3', 'RETAIL', 70, '2026-10-02'), ('4', 'RETAIL', 75, '2026-10-01'), ('99', 'RETAIL', 1, now()),
        ('5', 'RETAIL', 60, '2026-10-03'), ('6', 'RETAIL', 65, '2026-10-03')`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const columns = async (): Promise<string[]> =>
    (
        await dataSource.query(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = 'product_variant_price_entry'`,
            [schema],
        )
    ).map((c: { column_name: string }) => c.column_name);

const indexes = async (): Promise<string[]> =>
    (
        await dataSource.query(
            `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'product_variant_price_entry'`,
            [schema],
        )
    ).map((i: { indexname: string }) => i.indexname);

describe('price entry by product ERP id migration (integration, real Postgres)', () => {
    it('backfills the product ERP id, drops unkeyable and duplicate rows, and swaps the index', async () => {
        const qr = dataSource.createQueryRunner();
        try {
            await new PriceEntryByProductErpId1791540000000().up(qr);
        } finally {
            await qr.release();
        }

        const rows = await dataSource.query(
            `SELECT "productExternalId", "priceTypeCode", price FROM product_variant_price_entry ORDER BY "productExternalId", "priceTypeCode"`,
        );
        expect(rows).toEqual([
            { productExternalId: 'erp-1', priceTypeCode: 'RETAIL', price: '100' },
            { productExternalId: 'erp-1', priceTypeCode: 'WHOLESALE', price: '90' },
            { productExternalId: 'erp-3', priceTypeCode: 'RETAIL', price: '70' },
            { productExternalId: 'erp-5', priceTypeCode: 'RETAIL', price: '65' },
        ]);
        expect(await columns()).not.toContain('variantId');
        expect(await indexes()).toContain('IDX_ddee21f1a63880aa171f305bc5');
        expect(await indexes()).not.toContain('IDX_94d191d8ddc46b70764a3ab283');
        await expect(
            dataSource.query(
                `INSERT INTO product_variant_price_entry ("productExternalId", "priceTypeCode", price) VALUES ('erp-1', 'RETAIL', 1)`,
            ),
        ).rejects.toThrow(/duplicate key/);
    });

    it('down restores the variant key from the lowest variant of each product', async () => {
        const qr = dataSource.createQueryRunner();
        try {
            await new PriceEntryByProductErpId1791540000000().down(qr);
        } finally {
            await qr.release();
        }

        const rows = await dataSource.query(
            `SELECT "variantId", "priceTypeCode", price FROM product_variant_price_entry ORDER BY "variantId", "priceTypeCode"`,
        );
        expect(rows).toEqual([
            { variantId: '1', priceTypeCode: 'RETAIL', price: '100' },
            { variantId: '1', priceTypeCode: 'WHOLESALE', price: '90' },
            { variantId: '3', priceTypeCode: 'RETAIL', price: '70' },
            { variantId: '5', priceTypeCode: 'RETAIL', price: '65' },
        ]);
        expect(await columns()).not.toContain('productExternalId');
        expect(await indexes()).toContain('IDX_94d191d8ddc46b70764a3ab283');
    });
});
