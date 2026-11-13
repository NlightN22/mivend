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
        find: async (options: { where?: { id?: { value: number } }; take?: number } = {}) => {
            const rows: Row[] = await (ctx.manager ?? dataSource.manager).query(
                'select * from category where id > $1 order by id limit $2',
                [options.where?.id?.value ?? 0, options.take ?? 1_000_000],
            );
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

    it('a writer waiting behind a stuck holder fails with a lock timeout instead of hanging', async () => {
        const holder = dataSource.transaction(async manager => {
            await manager.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
                CATEGORY_TREE_LOCK,
            ]);
            await manager.query('select pg_sleep(3)');
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        await expect(
            withAggregateLock(connection as never, {} as never, CATEGORY_TREE_LOCK, async () => 1, {
                lockTimeoutMs: 300,
            }),
        ).rejects.toThrow(/lock timeout/);
        await holder;
        expect(
            await withAggregateLock(
                connection as never,
                {} as never,
                CATEGORY_TREE_LOCK,
                async () => 1,
                { lockTimeoutMs: 300 },
            ),
        ).toBe(1);
    });

    it('restores lock_timeout after taking the lock and sets an idle-in-transaction timeout', async () => {
        const seen = await withAggregateLock(
            connection as never,
            {} as never,
            CATEGORY_TREE_LOCK,
            async tx => {
                const { manager } = tx as unknown as TestCtx;
                const [row] = await manager.query(
                    "select current_setting('lock_timeout') as lt, current_setting('idle_in_transaction_session_timeout') as it",
                );
                return row;
            },
            { lockTimeoutMs: 300, idleTimeoutMs: 60_000 },
        );
        expect(seen.lt).toBe('0');
        expect(seen.it).toBe('1min');
    });

    it('kills an idle holder session and rolls its writes back whole', async () => {
        await dataSource.query('truncate category restart identity');
        await dataSource.query("insert into category (code) values ('root')");
        await expect(
            withAggregateLock(
                connection as never,
                {} as never,
                CATEGORY_TREE_LOCK,
                async tx => {
                    const { manager } = tx as unknown as TestCtx;
                    await manager.query('update category set "isPrivate" = true');
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    await manager.query('select 1');
                },
                { idleTimeoutMs: 300 },
            ),
        ).rejects.toThrow();
        expect(await privateOf('root')).toBe(false);
    });

    it('releases the lock between top-level subtrees so a feed writer is not blocked for the whole run', async () => {
        await dataSource.query('truncate category restart identity');
        await dataSource.query(
            "insert into category (code, override) values ('root', 'hidden'), ('other', 'hidden')",
        );
        await dataSource.query(
            "insert into category (\"parentId\", code) values (1, 'a'), (2, 'b')",
        );
        const order: string[] = [];
        let feed: Promise<void> | undefined;
        const slowDeps = {
            ...deps,
            collectionService: {
                update: async (ctx: TestCtx, input: { id: number; isPrivate?: boolean }) => {
                    await deps.collectionService.update(ctx, input);
                    if (feed === undefined) {
                        feed = withAggregateLock(
                            connection as never,
                            {} as never,
                            CATEGORY_TREE_LOCK,
                            async () => {
                                order.push('feed');
                            },
                        );
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                },
            },
        };
        await recomputeCategoryTree({} as never, slowDeps as never);
        order.push('recompute-done');
        await feed;
        expect(order).toEqual(['feed', 'recompute-done']);
    });

    it('a failure in a later subtree rolls back only that chunk', async () => {
        await dataSource.query('truncate category restart identity');
        await dataSource.query(
            "insert into category (code, override) values ('root', 'hidden'), ('other', 'hidden')",
        );
        await dataSource.query(
            "insert into category (\"parentId\", code) values (1, 'a'), (2, 'b')",
        );
        const failingDeps = {
            ...deps,
            collectionService: {
                update: async (ctx: TestCtx, input: { id: number; isPrivate?: boolean }) => {
                    await deps.collectionService.update(ctx, input);
                    if (input.id === 4) throw new Error('boom');
                },
            },
        };
        await expect(recomputeCategoryTree({} as never, failingDeps as never)).rejects.toThrow(
            'boom',
        );
        expect(await privateOf('root')).toBe(true);
        expect(await privateOf('a')).toBe(true);
        expect(await privateOf('other')).toBe(false);
        expect(await privateOf('b')).toBe(false);
    });

    it('recomputes a prod-sized tree (8000 categories, all hidden by one root) within a generous bound', async () => {
        await dataSource.query('truncate category restart identity');
        await dataSource.query("insert into category (code, override) values ('root', 'hidden')");
        await dataSource.query(
            `insert into category ("parentId", code)
             select case when g <= 100 then 1 else 2 + (g - 101) / 10 end, 'c' || g
             from generate_series(1, 7999) g`,
        );
        const started = Date.now();
        const writes = await recomputeCategoryTree({} as never, deps as never);
        // Covers only the SQL planning part; a real Vendure update (~70 ms each) is outside this bound.
        expect(Date.now() - started).toBeLessThan(120_000);
        expect(writes).toBeGreaterThanOrEqual(8000);
    });
});
