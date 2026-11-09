import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn, SelectQueryBuilder } from 'typeorm';

import { getPageAndCount } from '../../paginate-query';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from '../../testing/postgres-test-schema';

@Entity('page_row')
class PageRow {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) label!: string;
}

const { schema, extra } = testSchemaOptions('paginate_query');
const queries: string[] = [];
let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [PageRow],
        synchronize: true,
        logging: ['query'],
        logger: {
            logQuery: sql => void queries.push(sql),
            logQueryError: () => undefined,
            logQuerySlow: () => undefined,
            logSchemaBuild: () => undefined,
            logMigration: () => undefined,
            log: () => undefined,
        },
    });
    await dataSource.initialize();
    await dataSource
        .getRepository(PageRow)
        .insert(Array.from({ length: 12 }, (_, i) => ({ label: `row-${i}` })));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(() => {
    queries.length = 0;
});

const rows = (): SelectQueryBuilder<PageRow> =>
    dataSource.getRepository(PageRow).createQueryBuilder('r').orderBy('r.id', 'ASC');

describe('getPageAndCount (real Postgres)', () => {
    it('take 0 returns no items, the same total as a real page, and only a COUNT query', async () => {
        const countOnly = await getPageAndCount(rows(), 0);
        const page = await getPageAndCount(rows(), 5, 0);

        expect(countOnly).toEqual({ items: [], totalItems: 12 });
        expect(page.items).toHaveLength(5);
        expect(page.totalItems).toBe(countOnly.totalItems);
    });

    it('take 0 issues no row-hydrating SELECT', async () => {
        await getPageAndCount(rows(), 0);

        const selects = queries.filter(q => /^\s*SELECT/i.test(q));
        expect(selects).toHaveLength(1);
        expect(selects[0]).toMatch(/COUNT\(/i);
        expect(selects[0]).not.toMatch(/"label"/);
    });

    it('take > 0 pages with skip and keeps the order', async () => {
        const page = await getPageAndCount(rows(), 5, 10);

        expect(page.items.map(r => r.label)).toEqual(['row-10', 'row-11']);
        expect(page.totalItems).toBe(12);
    });
});
