import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryColumn,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    CATEGORY_FACET_CODE,
    categorySlug,
    createTestSchema,
    dropTestSchema,
    planCategoryVisibilityUpdates,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    type CategoryVisibilityNode,
} from 'shared';

import { HiddenCategoryProductsService } from '../../hidden-category-products.service';

@Entity('facet')
class TFacet {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
}

@Entity('facet_value')
class TFacetValue {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @ManyToOne(() => TFacet)
    @JoinColumn({ name: 'facetId' })
    facet!: TFacet;
}

@Entity('collection')
class TCollection {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean' }) isPrivate!: boolean;
    @OneToMany(() => TTranslation, t => t.base) translations!: TTranslation[];
}

@Entity('collection_translation')
class TTranslation {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) slug!: string;
    @ManyToOne(() => TCollection, c => c.translations)
    @JoinColumn({ name: 'baseId' })
    base!: TCollection;
}

@Entity('product')
class TProduct {
    @PrimaryGeneratedColumn() id!: number;
}

@Entity('product_variant')
class TVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productId!: number;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

@Entity('product_facet_values_facet_value')
class TProductFacetValue {
    @PrimaryColumn({ type: 'int' }) productId!: number;
    @PrimaryColumn({ type: 'int' }) facetValueId!: number;
}

@Entity('product_variant_facet_values_facet_value')
class TVariantFacetValue {
    @PrimaryColumn({ type: 'int' }) productVariantId!: number;
    @PrimaryColumn({ type: 'int' }) facetValueId!: number;
}

const { schema, extra } = testSchemaOptions('hidden_category_products');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: HiddenCategoryProductsService;
const collectionIds = new Map<string, number>();
const facetValueIds = new Map<string, number>();
const productIds = new Map<string, number>();

interface Cat {
    id: string;
    parent: string | null;
    feedHidden?: boolean;
    override?: 'hidden' | 'visible';
}

// root > mid > leaf, plus a sibling branch and an independent root.
const TREE: Cat[] = [
    { id: 'root', parent: null },
    { id: 'mid', parent: 'root' },
    { id: 'leaf', parent: 'mid' },
    { id: 'other', parent: 'root' },
    { id: 'solo', parent: null },
];

async function applyVisibility(tree: Cat[]): Promise<void> {
    const repo = dataSource.getRepository(TCollection);
    const nodes: CategoryVisibilityNode[] = tree.map(c => ({
        id: c.id,
        parentId: c.parent,
        slug: categorySlug(c.id),
        feedHidden: c.feedHidden ?? false,
        visibilityOverride: c.override ?? null,
        isPrivate: false,
    }));
    const hidden = new Set(
        planCategoryVisibilityUpdates(nodes)
            .filter(u => u.isPrivate)
            .map(u => u.id),
    );
    for (const cat of tree) {
        await repo.update(collectionIds.get(cat.id)!, { isPrivate: hidden.has(cat.id) });
    }
}

async function addProduct(name: string, category: string | null, on: 'product' | 'variant') {
    const product = await dataSource.getRepository(TProduct).save({});
    productIds.set(name, product.id);
    const variant = await dataSource.getRepository(TVariant).save({
        productId: product.id,
        deletedAt: null,
    });
    if (category === null) return;
    const facetValueId = facetValueIds.get(category)!;
    if (on === 'product') {
        await dataSource
            .getRepository(TProductFacetValue)
            .save({ productId: product.id, facetValueId });
    } else {
        await dataSource
            .getRepository(TVariantFacetValue)
            .save({ productVariantId: variant.id, facetValueId });
    }
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            TFacet,
            TFacetValue,
            TCollection,
            TTranslation,
            TProduct,
            TVariant,
            TProductFacetValue,
            TVariantFacetValue,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const category = await dataSource.getRepository(TFacet).save({ code: CATEGORY_FACET_CODE });
    const brand = await dataSource.getRepository(TFacet).save({ code: 'brand' });
    for (const cat of TREE) {
        const saved = await dataSource.getRepository(TCollection).save({ isPrivate: false });
        await dataSource
            .getRepository(TTranslation)
            .save({ slug: categorySlug(cat.id), base: saved });
        collectionIds.set(cat.id, saved.id);
        const fv = await dataSource
            .getRepository(TFacetValue)
            .save({ code: cat.id, facet: category });
        facetValueIds.set(cat.id, fv.id);
    }
    const sameCode = await dataSource
        .getRepository(TFacetValue)
        .save({ code: 'leaf', facet: brand });
    facetValueIds.set('brand-leaf', sameCode.id);

    await addProduct('inRoot', 'root', 'variant');
    await addProduct('inMid', 'mid', 'variant');
    await addProduct('inLeafOnVariant', 'leaf', 'variant');
    await addProduct('inLeafOnProduct', 'leaf', 'product');
    await addProduct('inOther', 'other', 'variant');
    await addProduct('inSolo', 'solo', 'product');
    await addProduct('uncategorized', null, 'variant');
    await addProduct('brandOnly', 'brand-leaf', 'variant');

    service = new HiddenCategoryProductsService({
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(
                entity === 'Channel'
                    ? TFacet
                    : (entity as { name: string }).name === 'Collection'
                      ? TCollection
                      : TFacet,
            ),
    } as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function hiddenNames(): Promise<string[]> {
    const all = [...productIds.values()];
    const hidden = await service.hiddenProductIds(ctx, all);
    return [...productIds]
        .filter(([, id]) => hidden.has(String(id)))
        .map(([name]) => name)
        .sort();
}

describe('hidden category products on real Postgres', () => {
    it('hides nothing while every category is visible', async () => {
        await applyVisibility(TREE);
        expect(await hiddenNames()).toEqual([]);
        expect(await service.hiddenFacetValueIds(ctx)).toEqual([]);
    });

    it('a directly hidden category hides its own products and every descendant, not siblings or uncategorized', async () => {
        await applyVisibility(TREE.map(c => (c.id === 'mid' ? { ...c, override: 'hidden' } : c)));
        expect(await hiddenNames()).toEqual(['inLeafOnProduct', 'inLeafOnVariant', 'inMid']);
        expect(await service.isCategoryHidden(ctx, 'mid')).toBe(true);
        expect(await service.isCategoryHidden(ctx, 'leaf')).toBe(true);
        expect(await service.isCategoryHidden(ctx, 'other')).toBe(false);
    });

    it('un-hiding restores the whole subtree', async () => {
        await applyVisibility(TREE);
        expect(await hiddenNames()).toEqual([]);
    });

    it('a feed-hidden root hides its whole tree but not an independent root', async () => {
        await applyVisibility(TREE.map(c => (c.id === 'root' ? { ...c, feedHidden: true } : c)));
        expect(await hiddenNames()).toEqual([
            'inLeafOnProduct',
            'inLeafOnVariant',
            'inMid',
            'inOther',
            'inRoot',
        ]);
    });

    it('a visible override under a hidden ancestor stays hidden, products included', async () => {
        await applyVisibility(
            TREE.map(c =>
                c.id === 'root'
                    ? { ...c, override: 'hidden' as const }
                    : c.id === 'mid'
                      ? { ...c, override: 'visible' as const }
                      : c,
            ),
        );
        expect(await hiddenNames()).toEqual([
            'inLeafOnProduct',
            'inLeafOnVariant',
            'inMid',
            'inOther',
            'inRoot',
        ]);
    });

    it('moving a category under a hidden parent hides its products, moving it out restores them', async () => {
        const hiddenRoot = (parentOfSolo: string | null): Cat[] =>
            TREE.map(c =>
                c.id === 'root'
                    ? { ...c, override: 'hidden' as const }
                    : c.id === 'solo'
                      ? { ...c, parent: parentOfSolo }
                      : c,
            );
        await applyVisibility(hiddenRoot('root'));
        expect(await hiddenNames()).toContain('inSolo');
        await applyVisibility(hiddenRoot(null));
        expect(await hiddenNames()).not.toContain('inSolo');
    });

    it('ignores a soft-deleted variant and a same-code value of another facet', async () => {
        await applyVisibility(TREE.map(c => (c.id === 'leaf' ? { ...c, override: 'hidden' } : c)));
        await dataSource
            .getRepository(TVariant)
            .update({ productId: productIds.get('inLeafOnVariant')! }, { deletedAt: new Date() });
        const names = await hiddenNames();
        expect(names).not.toContain('inLeafOnVariant');
        expect(names).toContain('inLeafOnProduct');
        expect(names).not.toContain('brandOnly');
    });

    it('returns an empty set for no input', async () => {
        expect((await service.hiddenProductIds(ctx, [])).size).toBe(0);
    });
});
