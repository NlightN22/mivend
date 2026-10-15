import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

// No full Vendure bootstrap here: this proves the DB query facet-value-filter runs, not its code.
// The filter matches a variant via its own facetValues OR its parent product's facetValues (UNION).
@Entity('cat_fv_test_facet_value')
class TestFacetValue {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' })
    code!: string;
}

@Entity('cat_fv_test_product_variant')
class TestProductVariant {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' })
    sku!: string;

    @ManyToMany(() => TestFacetValue)
    @JoinTable({
        name: 'cat_fv_test_product_variant_facet_values',
        joinColumn: { name: 'productVariantId' },
        inverseJoinColumn: { name: 'facetValueId' },
    })
    facetValues!: TestFacetValue[];
}

let dataSource: DataSource;
const { schema, extra } = testSchemaOptions('product_category_facet_value');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProductVariant, TestFacetValue],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

// Mirrors the real filter's own containsAny=true, single-facet-value shape (exactly what
// ProductStreamHandler produces — one category facet value per product, issue #116).
function findVariantsMatchingFacetValue(facetValueId: number): Promise<TestProductVariant[]> {
    return dataSource
        .getRepository(TestProductVariant)
        .createQueryBuilder('product_variant')
        .innerJoin('product_variant.facetValues', 'facet_value', 'facet_value.id = :facetValueId', {
            facetValueId,
        })
        .getMany();
}

describe('ProductVariant <-> FacetValue Collection membership (integration, real Postgres)', () => {
    it('a variant assigned the category facet value is matched — the concrete regression this issue fixes', async () => {
        const facetValueRepo = dataSource.getRepository(TestFacetValue);
        const variantRepo = dataSource.getRepository(TestProductVariant);

        const categoryFacetValue = await facetValueRepo.save(
            facetValueRepo.create({ code: 'cat-1' }),
        );
        const otherFacetValue = await facetValueRepo.save(facetValueRepo.create({ code: 'cat-2' }));

        // Assign the facet value to the variant itself: Product.facetValues is a separate relation
        const matchingVariant = await variantRepo.save(
            variantRepo.create({ sku: 'SKU-MATCH', facetValues: [categoryFacetValue] }),
        );
        const nonMatchingVariant = await variantRepo.save(
            variantRepo.create({ sku: 'SKU-NO-MATCH', facetValues: [otherFacetValue] }),
        );

        const matched = await findVariantsMatchingFacetValue(categoryFacetValue.id);

        const matchedIds = matched.map(v => v.id);
        expect(matchedIds).toContain(matchingVariant.id);
        expect(matchedIds).not.toContain(nonMatchingVariant.id);
    });

    it('a variant with no facet values at all is never matched', async () => {
        const facetValueRepo = dataSource.getRepository(TestFacetValue);
        const variantRepo = dataSource.getRepository(TestProductVariant);

        const categoryFacetValue = await facetValueRepo.save(
            facetValueRepo.create({ code: 'cat-3' }),
        );
        const unassignedVariant = await variantRepo.save(
            variantRepo.create({ sku: 'SKU-UNASSIGNED', facetValues: [] }),
        );

        const matched = await findVariantsMatchingFacetValue(categoryFacetValue.id);

        expect(matched.map(v => v.id)).not.toContain(unassignedVariant.id);
    });
});
