import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    QueryTooLargeError,
    createTestSchema,
    ctxQueryBounded,
    dropTestSchema,
    findBounded,
    getManyBounded,
    getRawManyBounded,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

@Entity('bounded_probe')
class BoundedProbe {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) grp!: string;
}

const CEILING = 5;
const mockCtx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('erp_bounded_reads');
let dataSource: DataSource;

async function seedProbe(count: number): Promise<void> {
    const repo = dataSource.getRepository(BoundedProbe);
    await repo.clear();
    await repo.save(Array.from({ length: count }, (_, i) => ({ grp: `g${i}` })));
}

async function failureOf(work: Promise<unknown>): Promise<QueryTooLargeError> {
    const failure = await work.catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(QueryTooLargeError);
    return failure as QueryTooLargeError;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [BoundedProbe],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('bounded helpers on real SQL shapes used by erp-integration', () => {
    beforeEach(() => seedProbe(0));

    it('getRawManyBounded: a grouped query passes at the ceiling and throws one over', async () => {
        const grouped = () =>
            dataSource
                .getRepository(BoundedProbe)
                .createQueryBuilder('p')
                .select('p.grp', 'grp')
                .addSelect('COUNT(*)', 'count')
                .groupBy('p.grp');
        await seedProbe(CEILING);
        expect(await getRawManyBounded(grouped(), CEILING)).toHaveLength(CEILING);
        await seedProbe(CEILING + 1);
        expect((await failureOf(getRawManyBounded(grouped(), CEILING))).ceiling).toBe(CEILING);
    });

    it('ctxQueryBounded: an ordered query with params passes at the ceiling and throws one over', async () => {
        const connection = {
            getRepository: () => dataSource.getRepository(BoundedProbe),
        } as unknown as TransactionalConnection;
        const read = () =>
            ctxQueryBounded(
                connection,
                mockCtx,
                'SELECT DISTINCT grp FROM bounded_probe WHERE grp LIKE $1 ORDER BY grp',
                ['g%'],
                CEILING,
            );
        await seedProbe(CEILING);
        expect(await read()).toHaveLength(CEILING);
        await seedProbe(CEILING + 1);
        expect((await failureOf(read())).extensions).toMatchObject({ code: 'QUERY_TOO_LARGE' });
    });

    it('getManyBounded: a skip-locked claim read passes at the ceiling and throws one over', async () => {
        const claim = (ceiling: number) =>
            dataSource.transaction(em =>
                getManyBounded(
                    em
                        .getRepository(BoundedProbe)
                        .createQueryBuilder('p')
                        .orderBy('p.id', 'ASC')
                        .setLock('pessimistic_write')
                        .setOnLocked('skip_locked'),
                    ceiling,
                ),
            );
        await seedProbe(CEILING);
        expect(await claim(CEILING)).toHaveLength(CEILING);
        await seedProbe(CEILING + 1);
        await failureOf(claim(CEILING));
    });
});

describe('findBounded on a repository', () => {
    it('returns every row at the ceiling and throws one over instead of dropping a row', async () => {
        const repo = dataSource.getRepository(BoundedProbe);
        await seedProbe(CEILING);
        expect(await findBounded(repo, {}, CEILING)).toHaveLength(CEILING);
        await seedProbe(CEILING + 1);
        const error = await failureOf(findBounded(repo, {}, CEILING));
        expect(error.ceiling).toBe(CEILING);
    });
});
