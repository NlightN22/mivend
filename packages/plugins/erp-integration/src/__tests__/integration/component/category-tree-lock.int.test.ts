import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import {
    CATEGORY_TREE_LOCK,
    categorySlug,
    createTestSchema,
    dropTestSchema,
    recomputeCategoryTree,
    resolveCategoryIsPrivate,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    withAggregateLock,
} from 'shared';

// No Vendure bootstrap: thin fakes over real tables; the advisory lock is real Postgres.
const { schema, extra } = testSchemaOptions('category_tree_lock');
let dataSource: DataSource;

interface TestCtx {
    manager: EntityManager;
}

interface Row {
    id: number;
    parentId: number | null;
    code: string;
    isPrivate: boolean;
    override: string | null;
}

const connection = {
    withTransaction: (_ctx: unknown, work: (ctx: TestCtx) => Promise<unknown>) =>
        dataSource.transaction(manager => work({ manager })),
    getRepository: (ctx: TestCtx) => ({
        query: (sql: string, params: unknown[]) => ctx.manager.query(sql, params),
        find: async () => {
            const rows: Row[] = await ctx.manager.query('select * from category order by id');
            return rows.map(r => ({
                id: r.id,
                parentId: r.parentId,
                isPrivate: r.isPrivate,
                filters: [],
                customFields: { feedHidden: false, visibilityOverride: r.override },
                translations: [
                    {
                        languageCode: 'en',
                        name: r.code,
                        slug: categorySlug(r.code),
                        description: '',
                    },
                ],
            }));
        },
    }),
};

const deps = {
    connection,
    collectionService: {
        update: async (ctx: TestCtx, input: { id: number; isPrivate?: boolean }) => {
            if (input.isPrivate === undefined) return;
            await ctx.manager.query('update category set "isPrivate" = $2 where id = $1', [
                input.id,
                input.isPrivate,
            ]);
        },
    },
    facetService: { findByCode: async () => ({ id: 1 }) },
    facetValueService: {
        findByFacetId: async () => [
            { id: 11, code: 'root' },
            { id: 12, code: 'child' },
        ],
    },
};

const privateOf = async (code: string): Promise<boolean> =>
    (await dataSource.query('select "isPrivate" from category where code = $1', [code]))[0]
        .isPrivate;

// The feed writer: reads the override under the shared lock, then writes the state it resolved.
async function feedEventForRoot(): Promise<void> {
    await withAggregateLock(connection as never, {} as never, CATEGORY_TREE_LOCK, async tx => {
        const { manager } = tx as unknown as TestCtx;
        const [row] = await manager.query("select override from category where code = 'root'");
        await manager.query('select pg_sleep(0.3)');
        await manager.query('update category set "isPrivate" = $1 where code = $2', [
            resolveCategoryIsPrivate(false, row.override, false),
            'root',
        ]);
    });
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(
        'create table category (id serial primary key, "parentId" int, code varchar not null, "isPrivate" boolean not null default false, override varchar)',
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('category tree writers against real Postgres', () => {
    it('a hidden ancestor still hides the subtree after an override change interleaved with a feed event', async () => {
        await dataSource.query('truncate category restart identity');
        await dataSource.query("insert into category (code) values ('root')");
        await dataSource.query('insert into category ("parentId", code) values (1, \'child\')');

        const feed = feedEventForRoot();
        await new Promise(resolve => setTimeout(resolve, 100));
        await dataSource.query(
            "update category set override = 'hidden', \"isPrivate\" = true where code = 'root'",
        );
        const recompute = recomputeCategoryTree({} as never, deps as never);
        await Promise.all([feed, recompute]);

        expect(await privateOf('root')).toBe(true);
        expect(await privateOf('child')).toBe(true);
    });

    it('two recomputes at once leave the same state as one', async () => {
        await dataSource.query('update category set override = null, "isPrivate" = false');
        await dataSource.query("update category set override = 'hidden' where code = 'root'");
        await Promise.all([
            recomputeCategoryTree({} as never, deps as never),
            recomputeCategoryTree({} as never, deps as never),
        ]);
        expect(await privateOf('root')).toBe(true);
        expect(await privateOf('child')).toBe(true);
    });
});
