import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { PriceEntryService } from '../../price-entry.service';

// Plain mirror of the price entry table (VendureEntity needs a bootstrapped id strategy).
@Index(['productExternalId', 'priceTypeCode'], { unique: true })
@Entity('product_variant_price_entry')
class TestPriceEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) productExternalId!: string;
    @Column({ type: 'varchar' }) priceTypeCode!: string;
    @Column({ type: 'bigint' }) price!: number;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

const { schema, extra } = testSchemaOptions('price_entry_by_product');
const ctx = testRequestContext;
let dataSource: DataSource;
let service: PriceEntryService;

const rows = (): Promise<
    Array<{ productExternalId: string; priceTypeCode: string; price: string }>
> =>
    dataSource.query(
        `SELECT "productExternalId", "priceTypeCode", price FROM product_variant_price_entry ORDER BY id`,
    );

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestPriceEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE product (id serial PRIMARY KEY, "customFieldsExternalid" varchar)`,
    );
    await dataSource.query(`CREATE TABLE product_variant (id serial PRIMARY KEY, "productId" int)`);
    service = new PriceEntryService(createTestConnection(dataSource));
});

beforeEach(async () => {
    await dataSource.query(
        `TRUNCATE product_variant_price_entry, product, product_variant RESTART IDENTITY`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const addProduct = async (erpId: string | null, variants = 1): Promise<void> => {
    const [{ id }] = await dataSource.query(
        `INSERT INTO product ("customFieldsExternalid") VALUES ($1) RETURNING id`,
        [erpId],
    );
    for (let i = 0; i < variants; i++) {
        await dataSource.query(`INSERT INTO product_variant ("productId") VALUES ($1)`, [id]);
    }
};

describe('price entries keyed by product ERP id (integration, real Postgres)', () => {
    it('upserts idempotently: a repeated write keeps one row with the latest price', async () => {
        await service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 100);
        await service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 100);
        await service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 150);
        await service.upsertByProduct(ctx, 'erp-1', 'WHOLESALE', 90);

        expect(await rows()).toEqual([
            { productExternalId: 'erp-1', priceTypeCode: 'RETAIL', price: '150' },
            { productExternalId: 'erp-1', priceTypeCode: 'WHOLESALE', price: '90' },
        ]);
    });

    it('removes by product ERP id and reports whether a price was stored', async () => {
        await service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 100);

        expect(await service.removeByProduct(ctx, 'erp-1', 'RETAIL')).toBe(true);
        expect(await service.removeByProduct(ctx, 'erp-1', 'RETAIL')).toBe(false);
        expect(await rows()).toEqual([]);
    });

    it('keeps a price stored before its product, and the variant resolves it once the product arrives', async () => {
        await service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 100);
        expect(await service.getForVariant(ctx, '1', 'RETAIL')).toBeNull();

        await addProduct('erp-1');

        expect(await service.getForVariant(ctx, '1', 'RETAIL')).toBe(100);
        expect((await service.getForVariants(ctx, ['1', '2'], 'RETAIL')).get('1')).toBe(100);
    });

    it('scopes reads to the price type and to the variant product', async () => {
        await addProduct('erp-1');
        await addProduct('erp-2');
        await service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 100);
        await service.upsertByProduct(ctx, 'erp-2', 'WHOLESALE', 70);

        const retail = await service.getForVariants(ctx, ['1', '2'], 'RETAIL');

        expect([...retail.entries()]).toEqual([['1', 100]]);
    });

    it('gives every variant of a product the product price', async () => {
        await addProduct('erp-1', 2);
        await service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 100);

        const map = await service.getForVariants(ctx, ['1', '2'], 'RETAIL');

        expect([...map.entries()]).toEqual([
            ['1', 100],
            ['2', 100],
        ]);
    });

    it('variant API: upsert writes to the product key and rejects a product without an ERP id', async () => {
        await addProduct('erp-1');
        await addProduct(null);

        const entry = await service.upsert(ctx, '1', 'RETAIL', 120);
        await service.upsert(ctx, '1', 'RETAIL', 130);

        expect(entry).toMatchObject({ variantId: '1', priceTypeCode: 'RETAIL', price: 120 });
        expect(await rows()).toEqual([
            { productExternalId: 'erp-1', priceTypeCode: 'RETAIL', price: '130' },
        ]);
        await expect(service.upsert(ctx, '2', 'RETAIL', 1)).rejects.toThrow('no product ERP id');
    });

    it('variant API: bulkUpsert stores one row per product key and skips products without an ERP id', async () => {
        await addProduct('erp-1', 2);
        await addProduct(null);

        const stored = await service.bulkUpsert(ctx, [
            { variantId: '1', priceTypeCode: 'RETAIL', price: 10 },
            { variantId: '2', priceTypeCode: 'RETAIL', price: 20 },
            { variantId: '3', priceTypeCode: 'RETAIL', price: 30 },
        ]);

        expect(stored).toBe(1);
        expect(await rows()).toEqual([
            { productExternalId: 'erp-1', priceTypeCode: 'RETAIL', price: '20' },
        ]);
    });

    it('two concurrent events for the same key leave exactly one row holding one of the values', async () => {
        for (let round = 0; round < 10; round++) {
            await Promise.all([
                service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 100 + round),
                service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 200 + round),
            ]);
            const stored = await rows();
            expect(stored).toHaveLength(1);
            expect([String(100 + round), String(200 + round)]).toContain(stored[0].price);
        }
    });

    it('a concurrent upsert and tombstone never error and leave at most one row', async () => {
        await Promise.all([
            ...Array.from({ length: 10 }, (_, i) =>
                service.upsertByProduct(ctx, 'erp-1', 'RETAIL', 100 + i),
            ),
            ...Array.from({ length: 10 }, () => service.removeByProduct(ctx, 'erp-1', 'RETAIL')),
        ]);

        expect((await rows()).length).toBeLessThanOrEqual(1);
    });
});
