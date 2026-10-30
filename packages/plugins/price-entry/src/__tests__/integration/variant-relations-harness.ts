import {
    Column,
    DataSource,
    Entity,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';

// Hand-rolled mirror of the variant -> product -> custom-field relation graph (a bare DataSource
// has no EntityIdStrategy, so the real entities cannot be registered). Names and shapes follow prod.
@Entity('manufacturer')
export class TestManufacturer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) externalId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
}

@Entity('facet')
export class TestFacet {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
}

@Entity('facet_value')
export class TestFacetValue {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @ManyToOne(() => TestFacet) facet!: TestFacet;
    @OneToMany(() => TestFacetValueTranslation, t => t.base)
    translations!: TestFacetValueTranslation[];
}

@Entity('facet_value_translation')
export class TestFacetValueTranslation {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) languageCode!: string;
    @Column({ type: 'varchar' }) name!: string;
    @ManyToOne(() => TestFacetValue, fv => fv.translations) base!: TestFacetValue;
}

export class TestProductCustomFields {
    @Column({ type: 'varchar', nullable: true }) externalId!: string | null;
    @ManyToOne(() => TestManufacturer, { nullable: true }) manufacturer!: TestManufacturer | null;
}

@Entity('product')
export class TestProduct {
    @PrimaryGeneratedColumn() id!: number;
    @Column(() => TestProductCustomFields) customFields!: TestProductCustomFields;
    @ManyToMany(() => TestFacetValue)
    @JoinTable({ name: 'product_facet_values' })
    facetValues!: TestFacetValue[];
}

export class TestVariantCustomFields {
    @Column({ type: 'float', nullable: true }) weight!: number | null;
}

@Entity('product_variant')
export class TestVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column(() => TestVariantCustomFields) customFields!: TestVariantCustomFields;
    @ManyToOne(() => TestProduct) product!: TestProduct;
    @ManyToMany(() => TestFacetValue)
    @JoinTable({ name: 'product_variant_facet_values' })
    facetValues!: TestFacetValue[];
}

export const VARIANT_GRAPH_ENTITIES = [
    TestManufacturer,
    TestFacet,
    TestFacetValue,
    TestFacetValueTranslation,
    TestProduct,
    TestVariant,
];

export function queryCountingLogger(counter: { count: number }): {
    logQuery: () => void;
    logQueryError: () => void;
    logQuerySlow: () => void;
    logSchemaBuild: () => void;
    logMigration: () => void;
    log: () => void;
} {
    const noop = (): void => undefined;
    return {
        logQuery: () => {
            counter.count++;
        },
        logQueryError: noop,
        logQuerySlow: noop,
        logSchemaBuild: noop,
        logMigration: noop,
        log: noop,
    };
}

export function resetVariantGraph(dataSource: DataSource): Promise<unknown> {
    return dataSource.query(
        'TRUNCATE product_variant_facet_values, product_variant, product_facet_values, product, facet_value_translation, facet_value, facet, manufacturer RESTART IDENTITY CASCADE',
    );
}

export async function seedVariants(
    dataSource: DataSource,
    count: number,
    maker: { externalId: string; name: string | null } | null,
): Promise<number[]> {
    const facet = await dataSource.getRepository(TestFacet).save({ code: 'category' });
    const fv = await dataSource.getRepository(TestFacetValue).save({ code: 'cat-1', facet });
    await dataSource
        .getRepository(TestFacetValueTranslation)
        .save({ languageCode: 'en', name: 'Category one', base: fv });
    const manufacturer = maker
        ? await dataSource.getRepository(TestManufacturer).save(maker)
        : null;
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
        const product = await dataSource.getRepository(TestProduct).save({
            customFields: { externalId: null, manufacturer },
            facetValues: [fv],
        });
        const variant = await dataSource
            .getRepository(TestVariant)
            .save({ customFields: { weight: 2 }, product, facetValues: [] });
        ids.push(variant.id);
    }
    return ids;
}
