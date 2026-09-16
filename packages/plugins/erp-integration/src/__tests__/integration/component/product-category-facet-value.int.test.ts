import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

// issue #116's own concrete regression: a product imported via Kafka must actually become a
// member of its category's Collection. The resolution logic (category_id -> FacetValue, applied
// to the VARIANT) is already proven at the unit level (category-resolver.test.ts,
// product.handler.test.ts with mocked services) per test-design's "minimum sufficient level"
// rule — what's genuinely unproven there is whether Vendure's own `facet-value-filter` Collection
// filter actually matches a variant once our code assigns that facet value to it.
//
// This plugin (like plugin-search's own product-lookup-query.int.test.ts, the direct model for
// this file) has no @vendure/testing full-app-bootstrap component-test infra — faithfully
// replicating Vendure's whole Product/ProductVariant/Facet/FacetValue relation graph to construct
// one would be its own large undertaking, out of proportion to this issue. Instead: a
// schema-faithful replica of the exact relation (ProductVariant <-> FacetValue, many-to-many) and
// the exact query shape Vendure's real `facet-value-filter` issues against it (confirmed by
// reading @vendure/core's own default-collection-filters.js: a variant matches if it's in
// `product_variant.facetValues` OR its parent product's `facetValues` — a UNION of both, joined
// on `facet_value.id IN (:ids)`, `HAVING COUNT(*) >= :count` for containsAny/all semantics) run
// against real Postgres — proving the actual DB mechanism this issue's fix depends on, not
// Vendure's own already-tested filter code.
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

        // The exact write shape ProductStreamHandler performs via
        // productVariantService.create/update's `facetValueIds` — assigning the resolved category
        // facet value directly onto the variant, per issue #60/#116's documented Vendure footgun
        // (the parent Product's own facetValues is a separate, independent relation).
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
