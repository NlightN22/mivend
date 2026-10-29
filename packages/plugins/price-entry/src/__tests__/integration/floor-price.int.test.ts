import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import { PriceType } from '@mivend/plugin-customer-pricing';
import { PriceTypeAccessService } from '@mivend/plugin-access-control';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { FloorPriceService } from '../../floor-price.service';
import { PriceEntryService } from '../../price-entry.service';
import { ProductVariantPriceEntry } from '../../price-entry.entity';

// VendureEntity's primary column needs a bootstrapped EntityIdStrategy; a bare DataSource has none.
@Entity('price_type')
class TestPriceType {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) code!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) externalId!: string | null;
    @Column({ type: 'varchar', default: 'confidential' }) visibility!: string;
    @Column({ type: 'boolean', default: false }) isPurchase!: boolean;
    @Column({
        type: 'numeric',
        precision: 12,
        scale: 6,
        nullable: true,
        transformer: {
            to: (v: number | null) => v,
            from: (v: string | null) => (v === null ? null : Number(v)),
        },
    })
    ceilingMultiplier!: number | null;
}

@Entity('product_variant_price_entry')
class TestPriceEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) productExternalId!: string;
    @Column({ type: 'varchar' }) priceTypeCode!: string;
    @Column({ type: 'bigint' }) price!: number;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                (entity === PriceType
                    ? TestPriceType
                    : entity === ProductVariantPriceEntry
                      ? TestPriceEntry
                      : entity) as never,
            ),
    } as unknown as TransactionalConnection;
}

let dataSource: DataSource;
let floor: FloorPriceService;
let access: PriceTypeAccessService;
const { schema, extra } = testSchemaOptions('price_entry_floor');
const ctx = testRequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestPriceType, TestPriceEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE product (id serial PRIMARY KEY, "customFieldsExternalid" varchar)`,
    );
    await dataSource.query(`CREATE TABLE product_variant (id serial PRIMARY KEY, "productId" int)`);
    await dataSource.query(
        `INSERT INTO product ("customFieldsExternalid") VALUES ('erp-1'), ('erp-2')`,
    );
    await dataSource.query(`INSERT INTO product_variant ("productId") VALUES (1), (2)`);
    const connection = mapEntity(createTestConnection(dataSource));
    floor = new FloorPriceService(connection, new PriceEntryService(connection));
    access = new PriceTypeAccessService(connection, {} as never, {} as never);
});

afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE product_variant_price_entry, price_type CASCADE');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('derived floor price (integration, real Postgres)', () => {
    it('is the purchase entry times the multiplier of the purchase type only', async () => {
        await dataSource.getRepository(TestPriceType).save([
            { code: 'purchase', name: 'P', isPurchase: true, ceilingMultiplier: 1.25 },
            { code: 'retail', name: 'R', visibility: 'customer' },
        ]);
        await dataSource.getRepository(TestPriceEntry).save([
            { productExternalId: 'erp-1', priceTypeCode: 'purchase', price: 100 },
            { productExternalId: 'erp-1', priceTypeCode: 'retail', price: 999 },
        ]);

        const map = await floor.forVariants(ctx, ['1', '2']);

        expect(map.get('1')).toBe(125);
        expect(map.has('2')).toBe(false);
    });

    it('is unknown when the purchase type has no multiplier', async () => {
        await dataSource
            .getRepository(TestPriceType)
            .save({ code: 'purchase', name: 'P', isPurchase: true });
        await dataSource
            .getRepository(TestPriceEntry)
            .save({ productExternalId: 'erp-1', priceTypeCode: 'purchase', price: 100 });

        expect((await floor.forVariants(ctx, ['1'])).size).toBe(0);
    });
});

describe('PriceTypeAccessService.list (real SQL)', () => {
    it('lists ids as strings with visibility, hiding confidential types without the permission', async () => {
        await dataSource.getRepository(TestPriceType).save([
            { code: 'purchase', name: 'P', isPurchase: true },
            { code: 'retail', name: 'R', visibility: 'customer' },
        ]);
        const allCustomer = {
            userHasPermissions: (p: string[]) => p[0] === 'ReadAllCustomerPriceTypes',
        };
        const rows = await access.list({ ...ctx, ...allCustomer } as never);

        expect(rows.map(r => r.code)).toEqual(['retail']);
        expect(typeof rows[0].id).toBe('string');
    });
});
