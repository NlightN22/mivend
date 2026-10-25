import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { CATEGORY_FACET_CODE, categorySlug } from 'shared';

import { HiddenCategoryFacetValuesService } from '../../hidden-category-facet-values.service';

@Entity('facet')
class TestFacet {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
}

@Entity('facet_value')
class TestFacetValue {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @ManyToOne(() => TestFacet)
    @JoinColumn()
    facet!: TestFacet;
}

@Entity('collection')
class TestCollection {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean' }) isPrivate!: boolean;
    @OneToMany(() => TestCollectionTranslation, t => t.base)
    translations!: TestCollectionTranslation[];
}

@Entity('collection_translation')
class TestCollectionTranslation {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) slug!: string;
    @ManyToOne(() => TestCollection, c => c.translations)
    base!: TestCollection;
}

let dataSource: DataSource;
let service: HiddenCategoryFacetValuesService;
const { schema, extra } = testSchemaOptions('hidden_category_facet_values');
const ctx = {} as RequestContext;
const ids: Record<string, number> = {};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestFacet, TestFacetValue, TestCollection, TestCollectionTranslation],
        synchronize: true,
    });
    await dataSource.initialize();
    const category = await dataSource.getRepository(TestFacet).save({ code: CATEGORY_FACET_CODE });
    const other = await dataSource.getRepository(TestFacet).save({ code: 'brand' });
    const fv = dataSource.getRepository(TestFacetValue);
    const save = async (key: string, code: string, facet: TestFacet): Promise<void> => {
        ids[key] = (await fv.save({ code, facet })).id;
    };
    await save('hiddenCat', 'cat-hidden', category);
    await save('visibleCat', 'cat-visible', category);
    await save('sameCodeOtherFacet', 'cat-hidden', other);
    const col = dataSource.getRepository(TestCollection);
    const tr = dataSource.getRepository(TestCollectionTranslation);
    const makeCollection = async (key: string, slug: string, isPrivate: boolean): Promise<void> => {
        const saved = await col.save({ isPrivate });
        ids[key] = saved.id;
        await tr.save({ slug, base: saved });
    };
    await makeCollection('privateCol', categorySlug('cat-hidden'), true);
    await makeCollection('publicCol', categorySlug('cat-visible'), false);
    service = new HiddenCategoryFacetValuesService({
        getRepository: (_ctx: unknown, entity: { name: string }) =>
            dataSource.getRepository(
                entity.name === 'FacetValue'
                    ? TestFacetValue
                    : entity.name === 'Collection'
                      ? TestCollection
                      : TestFacet,
            ),
    } as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('HiddenCategoryFacetValuesService on real Postgres', () => {
    it('hides only category facet values whose collection is private', async () => {
        const hidden = await service.findHiddenIds(ctx, [
            ids.hiddenCat,
            ids.visibleCat,
            ids.sameCodeOtherFacet,
        ]);
        expect([...hidden]).toEqual([String(ids.hiddenCat)]);
    });

    it('returns an empty set for no input', async () => {
        expect((await service.findHiddenIds(ctx, [])).size).toBe(0);
        expect((await service.findPrivateCollectionIds(ctx, [])).size).toBe(0);
    });

    it('finds private collection ids only', async () => {
        const privateIds = await service.findPrivateCollectionIds(ctx, [
            ids.privateCol,
            ids.publicCol,
        ]);
        expect([...privateIds]).toEqual([String(ids.privateCol)]);
    });
});
