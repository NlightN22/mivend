import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ManufacturerService } from '../../../manufacturer.service';
import { ProductAncillaryDataService } from '../../../product-ancillary-data.service';

// The mapping logic (payload -> rows) is already covered at the unit level
// (product-characteristics-mapper.test.ts, product-ancillary-fields.test.ts) per test-design's
// "minimum sufficient level" rule. What's genuinely unproven there is whether these services'
// real TypeORM delete-then-insert round-trips correctly against Postgres, and — for
// ManufacturerService specifically — the non-destructive name-backfill behavior (issue #116).
// Same schema-per-file bootstrap as product-tax-code-flag.int.test.ts.
@Entity('anc_test_manufacturer')
class TestManufacturer {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) externalId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
}

@Entity('anc_test_barcode')
class TestBarcode {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) productVariantId!: string;
    @Column({ type: 'varchar' }) code!: string;
}

@Entity('anc_test_characteristic')
class TestCharacteristic {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) productId!: string;
    @Column({ type: 'varchar' }) group!: string;
    @Column({ type: 'varchar' }) key!: string;
    @Column({ type: 'varchar', nullable: true }) rawValue!: string | null;
    @Column({ type: 'text', nullable: true }) normalizedValue!: string | null;
    @Column({ type: 'text', nullable: true }) structuredJson!: string | null;
}

@Entity('anc_test_manufacturer_code')
class TestManufacturerCode {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) productId!: string;
    @Column({ type: 'int' }) lineNumber!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar' }) manufacturer!: string;
}

let dataSource: DataSource;
let manufacturerService: ManufacturerService;
const ctx = {} as RequestContext;

const { schema, extra } = testSchemaOptions('erp_integration_product_ancillary_data');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestManufacturer, TestBarcode, TestCharacteristic, TestManufacturerCode],
        synchronize: true,
    });
    await dataSource.initialize();

    // Each service only ever asks for its own entity's repo — a small per-entity connection shim
    // per service keeps this simple without needing to replicate a real DI container.
    manufacturerService = new ManufacturerService({
        getRepository: () => dataSource.getRepository(TestManufacturer),
    } as unknown as TransactionalConnection);
});

afterEach(async () => {
    await dataSource.getRepository(TestManufacturer).clear();
    await dataSource.getRepository(TestBarcode).clear();
    await dataSource.getRepository(TestCharacteristic).clear();
    await dataSource.getRepository(TestManufacturerCode).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('ManufacturerService (integration, real Postgres)', () => {
    it('creates a new Manufacturer with the given name', async () => {
        const result = await manufacturerService.upsert(ctx, 'guid-1', 'Yokohama');

        expect(result).toMatchObject({ externalId: 'guid-1', name: 'Yokohama' });
    });

    it('creates with a null name when none is given yet', async () => {
        const result = await manufacturerService.upsert(ctx, 'guid-1', undefined);

        expect(result).toMatchObject({ externalId: 'guid-1', name: null });
    });

    it('backfills the name on a later event that finally carries one', async () => {
        await manufacturerService.upsert(ctx, 'guid-1', undefined);

        const result = await manufacturerService.upsert(ctx, 'guid-1', 'Yokohama');

        expect(result.name).toBe('Yokohama');
        const rows = await dataSource.getRepository(TestManufacturer).find();
        expect(rows).toHaveLength(1);
    });

    // issue #116: name is never cleared back to null just because a later event happens not to
    // carry one — absence doesn't mean "no longer has a name."
    it('never clears an already-known name when a later event carries none', async () => {
        await manufacturerService.upsert(ctx, 'guid-1', 'Yokohama');

        const result = await manufacturerService.upsert(ctx, 'guid-1', undefined);

        expect(result.name).toBe('Yokohama');
    });
});

describe('ProductAncillaryDataService (integration, real Postgres)', () => {
    it('replaceBarcodes persists the given codes for the variant', async () => {
        const service = new ProductAncillaryDataService({
            getRepository: () => dataSource.getRepository(TestBarcode),
        } as unknown as TransactionalConnection);

        await service.replaceBarcodes(ctx, 'variant-1', ['111', '222']);

        const rows = await dataSource.getRepository(TestBarcode).find();
        expect(rows.map(r => r.code).sort()).toEqual(['111', '222']);
    });

    it('replaceBarcodes on a second call fully replaces the prior set (idempotent full-state upsert)', async () => {
        const service = new ProductAncillaryDataService({
            getRepository: () => dataSource.getRepository(TestBarcode),
        } as unknown as TransactionalConnection);

        await service.replaceBarcodes(ctx, 'variant-1', ['111', '222']);
        await service.replaceBarcodes(ctx, 'variant-1', ['333']);

        const rows = await dataSource.getRepository(TestBarcode).find({
            where: { productVariantId: 'variant-1' },
        });
        expect(rows.map(r => r.code)).toEqual(['333']);
    });

    it('replaceBarcodes with an empty array clears all rows for that variant', async () => {
        const service = new ProductAncillaryDataService({
            getRepository: () => dataSource.getRepository(TestBarcode),
        } as unknown as TransactionalConnection);

        await service.replaceBarcodes(ctx, 'variant-1', ['111']);
        await service.replaceBarcodes(ctx, 'variant-1', []);

        const rows = await dataSource
            .getRepository(TestBarcode)
            .find({ where: { productVariantId: 'variant-1' } });
        expect(rows).toEqual([]);
    });

    it('replaceCharacteristics fully replaces the prior set for the product', async () => {
        const service = new ProductAncillaryDataService({
            getRepository: () => dataSource.getRepository(TestCharacteristic),
        } as unknown as TransactionalConnection);

        await service.replaceCharacteristics(ctx, 'product-1', [
            {
                group: 'attribute',
                key: 'A',
                rawValue: 'x',
                normalizedValue: null,
                structuredJson: null,
            },
        ]);
        await service.replaceCharacteristics(ctx, 'product-1', [
            {
                group: 'attribute',
                key: 'B',
                rawValue: 'y',
                normalizedValue: null,
                structuredJson: null,
            },
        ]);

        const rows = await dataSource
            .getRepository(TestCharacteristic)
            .find({ where: { productId: 'product-1' } });
        expect(rows.map(r => r.key)).toEqual(['B']);
    });

    it('replaceManufacturerCodes fully replaces the prior set for the product', async () => {
        const service = new ProductAncillaryDataService({
            getRepository: () => dataSource.getRepository(TestManufacturerCode),
        } as unknown as TransactionalConnection);

        await service.replaceManufacturerCodes(ctx, 'product-1', [
            { lineNumber: 1, code: 'OEM-1', manufacturer: 'guid-a' },
        ]);
        await service.replaceManufacturerCodes(ctx, 'product-1', [
            { lineNumber: 2, code: 'OEM-2', manufacturer: 'guid-b' },
            { lineNumber: 3, code: 'OEM-3', manufacturer: 'guid-c' },
        ]);

        const rows = await dataSource
            .getRepository(TestManufacturerCode)
            .find({ where: { productId: 'product-1' } });
        expect(rows.map(r => r.code).sort()).toEqual(['OEM-2', 'OEM-3']);
    });
});
