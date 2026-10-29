import type { DataSource } from 'typeorm';

export const PRODUCT_COUNT = 20_000;

// Synthetic catalog: one variant per product, two price types priced for every product.
export async function createBenchTables(ds: DataSource): Promise<void> {
    await ds.query(
        `CREATE TABLE product (id serial PRIMARY KEY, "customFieldsExternalid" varchar)`,
    );
    await ds.query(
        `CREATE TABLE product_variant (id serial PRIMARY KEY, "productId" int, sku varchar)`,
    );
    await ds.query(`CREATE INDEX ON product_variant ("productId")`);
    await ds.query(`CREATE INDEX ON product ("customFieldsExternalid")`);
    await ds.query(`CREATE TABLE product_variant_price_entry (
        "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        id serial PRIMARY KEY, "productExternalId" varchar NOT NULL, "priceTypeCode" varchar NOT NULL, price bigint NOT NULL)`);
    await ds.query(
        `CREATE UNIQUE INDEX ON product_variant_price_entry ("productExternalId", "priceTypeCode")`,
    );
    await ds.query(
        `INSERT INTO product ("customFieldsExternalid") SELECT 'erp-' || g FROM generate_series(1, ${PRODUCT_COUNT}) g`,
    );
    await ds.query(
        `INSERT INTO product_variant ("productId", sku) SELECT id, 'sku-' || id FROM product`,
    );
    for (const code of ['WHOLESALE', 'RETAIL']) {
        await ds.query(
            `INSERT INTO product_variant_price_entry ("productExternalId", "priceTypeCode", price)
             SELECT "customFieldsExternalid", '${code}', 10000 + id FROM product`,
        );
    }
    await ds.query('ANALYZE');
}
