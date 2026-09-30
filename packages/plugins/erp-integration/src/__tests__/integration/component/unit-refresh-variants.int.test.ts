import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

// Audit finding (mivend#103, MEDIUM): UnitStreamHandler.refreshVariants issues a raw UPDATE with
// an IS DISTINCT FROM guard so a repeated, unchanged UnitChanged is a 0-row no-op — proven here
// against real Postgres (a mocked unit test can only prove the SQL string was built, not that
// Postgres actually treats it as a no-op), same pattern as this plugin's own
// product-category-facet-value.int.test.ts.
@Entity('unit_refresh_test_product_variant')
class TestProductVariant {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', nullable: true })
    customFieldsDefaultsalesunitid!: string | null;

    @Column({ type: 'float', nullable: true })
    customFieldsUnitratiotobase!: number | null;

    @Column({ type: 'float', nullable: true })
    customFieldsUnitweightkg!: number | null;

    @Column({ type: 'float', nullable: true })
    customFieldsUnitvolumel!: number | null;

    @Column({ type: 'timestamp', nullable: true })
    deletedAt!: Date | null;
}

let dataSource: DataSource;
const { schema, extra } = testSchemaOptions('unit_refresh_variants');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProductVariant],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

// The exact query UnitStreamHandler.refreshVariants issues (table/column names differ only by
// this test's own replica table).
function refresh(
    defaultSalesUnitId: string,
    unitRatioToBase: number,
    unitWeightKg: number | null,
    unitVolumeL: number | null,
): Promise<{ affected?: number | null }> {
    return dataSource
        .createQueryBuilder()
        .update('unit_refresh_test_product_variant')
        .set({
            customFieldsUnitratiotobase: unitRatioToBase,
            customFieldsUnitweightkg: unitWeightKg,
            customFieldsUnitvolumel: unitVolumeL,
        })
        .where('"customFieldsDefaultsalesunitid" = :defaultSalesUnitId', { defaultSalesUnitId })
        .andWhere('"deletedAt" IS NULL')
        .andWhere(
            '("customFieldsUnitratiotobase" IS DISTINCT FROM :unitRatioToBase OR ' +
                '"customFieldsUnitweightkg" IS DISTINCT FROM :unitWeightKg OR ' +
                '"customFieldsUnitvolumel" IS DISTINCT FROM :unitVolumeL)',
            { unitRatioToBase, unitWeightKg, unitVolumeL },
        )
        .execute();
}

describe('UnitStreamHandler.refreshVariants UPDATE (integration, real Postgres)', () => {
    it('updates a variant on real change, and is a 0-row no-op on an identical repeat', async () => {
        const repo = dataSource.getRepository(TestProductVariant);
        const variant = await repo.save(
            repo.create({
                customFieldsDefaultsalesunitid: 'unit-1',
                customFieldsUnitratiotobase: 1,
            }),
        );

        const first = await refresh('unit-1', 4, 16.8, 18.5);
        expect(first.affected).toBe(1);

        const reloaded = await repo.findOneByOrFail({ id: variant.id });
        expect(reloaded.customFieldsUnitratiotobase).toBe(4);

        const repeat = await refresh('unit-1', 4, 16.8, 18.5);
        expect(repeat.affected).toBe(0);
    });

    it('never touches a soft-deleted variant', async () => {
        const repo = dataSource.getRepository(TestProductVariant);
        await repo.save(
            repo.create({
                customFieldsDefaultsalesunitid: 'unit-2',
                customFieldsUnitratiotobase: 1,
                deletedAt: new Date(),
            }),
        );

        const result = await refresh('unit-2', 4, 16.8, 18.5);
        expect(result.affected).toBe(0);
    });

    it('never touches a variant with a different defaultSalesUnitId', async () => {
        const repo = dataSource.getRepository(TestProductVariant);
        await repo.save(
            repo.create({
                customFieldsDefaultsalesunitid: 'unit-other',
                customFieldsUnitratiotobase: 1,
            }),
        );

        const result = await refresh('unit-3', 4, 16.8, 18.5);
        expect(result.affected).toBe(0);
    });
});
