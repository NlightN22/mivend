import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { DataSource } from 'typeorm';

// Plain mirror: VendureEntity needs a bootstrapped id strategy.
@Entity('product_variant_price_entry')
export class BenchPriceEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) variantId!: string;
    @Column({ type: 'varchar' }) priceTypeCode!: string;
    @Column({ type: 'bigint' }) price!: number;
}

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
        id serial PRIMARY KEY, "variantId" varchar NOT NULL, "priceTypeCode" varchar NOT NULL, price bigint NOT NULL)`);
    await ds.query(
        `CREATE UNIQUE INDEX ON product_variant_price_entry ("variantId", "priceTypeCode")`,
    );
    await ds.query(
        `INSERT INTO product ("customFieldsExternalid") SELECT 'erp-' || g FROM generate_series(1, ${PRODUCT_COUNT}) g`,
    );
    await ds.query(
        `INSERT INTO product_variant ("productId", sku) SELECT id, 'sku-' || id FROM product`,
    );
    for (const code of ['WHOLESALE', 'RETAIL']) {
        await ds.query(
            `INSERT INTO product_variant_price_entry ("variantId", "priceTypeCode", price)
             SELECT id, '${code}', 10000 + id FROM product_variant`,
        );
    }
    await ds.query('ANALYZE');
}
