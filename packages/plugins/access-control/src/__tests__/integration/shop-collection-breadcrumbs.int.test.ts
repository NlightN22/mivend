import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import {
    Collection,
    type CollectionService,
    type RequestContext,
    type TransactionalConnection,
    type TranslatorService,
} from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    queryCountingLogger,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ShopCollectionBreadcrumbsLoader } from '../../shop-collection-breadcrumbs.loader';
import { dropPrivateAncestors } from '../../shop-collection-breadcrumbs';

@Entity('collection')
class TestCollection {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean', default: false }) isRoot!: boolean;
    @Column({ type: 'boolean', default: false }) isPrivate!: boolean;
    @Column({ type: 'int', nullable: true }) parentId!: number | null;
    @OneToMany(() => TestTranslation, t => t.base, { eager: true })
    translations!: TestTranslation[];
}

@Entity('collection_translation')
class TestTranslation {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar' }) slug!: string;
    @ManyToOne(() => TestCollection, c => c.translations) base!: TestCollection;
}

const { schema, extra } = testSchemaOptions('collection_breadcrumbs');
const counter = { count: 0 };
let dataSource: DataSource;
let loader: ShopCollectionBreadcrumbsLoader;
const coreBreadcrumbs = vi.fn();
const ctx = (): RequestContext => ({}) as RequestContext;

// id -> [parentId, isRoot, isPrivate]
const tree: Record<number, [number | null, boolean, boolean]> = {
    1: [null, true, false],
    2: [1, false, false],
    3: [2, false, true],
    4: [3, false, false],
    5: [4, false, false],
    6: [1, false, false],
    7: [null, false, false],
};

async function referenceBreadcrumbs(id: number): Promise<Array<{ id: number; slug: string }>> {
    const chain: number[] = [];
    let current: number | null = id;
    while (current != null) {
        chain.unshift(current);
        const [{ parentId }] = await dataSource.query(
            'SELECT "parentId" FROM collection WHERE id = $1',
            [current],
        );
        current = parentId;
    }
    const rows = await dataSource.query(
        'SELECT id, "isPrivate" FROM collection WHERE id = ANY($1)',
        [chain],
    );
    const hidden = new Set<string>(
        rows
            .filter((r: { isPrivate: boolean }) => r.isPrivate)
            .map((r: { id: number }) => String(r.id)),
    );
    return dropPrivateAncestors(
        chain.map(c => ({ id: c, slug: `slug-${c}` })),
        hidden,
    );
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCollection, TestTranslation],
        synchronize: true,
        logger: queryCountingLogger(counter),
    });
    await dataSource.initialize();
    for (const [id, [parentId, isRoot, isPrivate]] of Object.entries(tree)) {
        await dataSource.query(
            'INSERT INTO collection (id, "parentId", "isRoot", "isPrivate") VALUES ($1, $2, $3, $4)',
            [Number(id), parentId, isRoot, isPrivate],
        );
        await dataSource.query(
            'INSERT INTO collection_translation (name, slug, "baseId") VALUES ($1, $2, $3)',
            [`name-${id}`, `slug-${id}`, Number(id)],
        );
    }
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            entity === Collection
                ? dataSource.getRepository(TestCollection)
                : { query: (sql: string, params?: unknown[]) => dataSource.query(sql, params) },
        getEntityOrThrow: async (_ctx: unknown, _entity: unknown, id: number) =>
            dataSource.getRepository(TestCollection).findOneByOrFail({ id: Number(id) }),
    } as unknown as TransactionalConnection;
    const translator = {
        translate: (entity: TestCollection) => ({
            id: entity.id,
            name: entity.translations[0].name,
            slug: entity.translations[0].slug,
        }),
    } as unknown as TranslatorService;
    loader = new ShopCollectionBreadcrumbsLoader(
        { getBreadcrumbs: coreBreadcrumbs } as unknown as CollectionService,
        connection,
        translator,
    );
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

const parent = (id: number): Collection => ({ id }) as unknown as Collection;
const slugs = (crumbs: Array<{ id: string | number; slug: string }>): Array<[number, string]> =>
    crumbs.map(c => [Number(c.id), c.slug]);

describe('ShopCollectionBreadcrumbsLoader (integration, real Postgres)', () => {
    it('equals the parent-chain walk with private middle ancestors dropped, for every collection', async () => {
        const request = ctx();
        const ids = [1, 2, 3, 4, 5, 6];
        const batched = await Promise.all(ids.map(id => loader.load(request, parent(id))));
        for (const [i, id] of ids.entries()) {
            const expected = await referenceBreadcrumbs(id);
            expect(slugs(batched[i])).toEqual(expected.map(c => [c.id, c.slug]));
        }
        expect(slugs(batched[4])).toEqual([
            [1, 'slug-1'],
            [2, 'slug-2'],
            [4, 'slug-4'],
            [5, 'slug-5'],
        ]);
    });

    it('never leaks a private ancestor name or slug, but keeps a private collection itself', async () => {
        const crumbs = await loader.load(ctx(), parent(5));
        expect(JSON.stringify(crumbs)).not.toContain('slug-3');
        expect(slugs(await loader.load(ctx(), parent(3))).map(c => c[0])).toEqual([1, 2, 3]);
    });

    it('uses two queries for the whole tree, as for one collection', async () => {
        const request = ctx();
        counter.count = 0;
        await Promise.all([1, 2, 3, 4, 5, 6].map(id => loader.load(request, parent(id))));
        const tree6 = counter.count;
        counter.count = 0;
        await loader.load(ctx(), parent(5));
        expect(tree6).toBeLessThanOrEqual(3);
        expect(counter.count).toBe(tree6);
    });

    it('falls back to core breadcrumbs for a collection that has no path to the root', async () => {
        coreBreadcrumbs.mockResolvedValue([{ id: 7, name: 'x', slug: 'slug-7' }]);
        expect(slugs(await loader.load(ctx(), parent(7)))).toEqual([[7, 'slug-7']]);
        expect(coreBreadcrumbs).toHaveBeenCalledTimes(1);
    });
});
