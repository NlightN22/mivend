import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CategorySubtreeService } from '../../category-subtree.service';

// Real SQL over hand-rolled tables with Vendure's physical column names.
const { schema, extra } = testSchemaOptions('category_subtree');
let dataSource: DataSource;
const run = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(sql, params);

async function addCategory(
    code: string,
    parentId: number | null,
    facetId: number | null,
    isPrivate = false,
): Promise<{ collectionId: number; facetValueId: number | null }> {
    const [col] = await run(
        `INSERT INTO collection ("parentId", "isPrivate") VALUES ($1, $2) RETURNING id`,
        [parentId, isPrivate],
    );
    await run(`INSERT INTO collection_translation ("baseId", slug) VALUES ($1, $2)`, [
        col.id,
        `cat-${code}`,
    ]);
    if (facetId === null) return { collectionId: Number(col.id), facetValueId: null };
    const [fv] = await run(
        `INSERT INTO facet_value ("facetId", code) VALUES ($1, $2) RETURNING id`,
        [facetId, code],
    );
    return { collectionId: Number(col.id), facetValueId: Number(fv.id) };
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
    await run(`CREATE TABLE facet (id serial PRIMARY KEY, code text)`);
    await run(`CREATE TABLE facet_value (id serial PRIMARY KEY, "facetId" int, code text)`);
    await run(
        `CREATE TABLE collection (id serial PRIMARY KEY, "parentId" int, "isPrivate" boolean)`,
    );
    await run(
        `CREATE TABLE collection_translation (id serial PRIMARY KEY, "baseId" int, slug text)`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('CategorySubtreeService (real SQL)', () => {
    it('widens a parent to visible descendants and skips hidden branches', async () => {
        const [category] = await run(`INSERT INTO facet (code) VALUES ('category') RETURNING id`);
        const [other] = await run(`INSERT INTO facet (code) VALUES ('manufacturer') RETURNING id`);
        const facetId = Number(category.id);
        const parent = await addCategory('p', null, facetId);
        const child = await addCategory('c', parent.collectionId, facetId);
        const grand = await addCategory('g', child.collectionId, facetId);
        const hidden = await addCategory('h', parent.collectionId, facetId, true);
        await addCategory('hk', hidden.collectionId, facetId);
        const [brand] = await run(
            `INSERT INTO facet_value ("facetId", code) VALUES ($1, 'c') RETURNING id`,
            [other.id],
        );
        const service = new CategorySubtreeService({
            getRepository: () => ({ query: run }),
        } as never);

        const result = await service.expand({} as never, {
            facetValueFilters: [{ or: [String(parent.facetValueId)] }, { or: [String(brand.id)] }],
        });

        const widened = (result.facetValueFilters?.[0].or ?? []).map(String).sort();
        expect(widened).toEqual([parent, child, grand].map(n => String(n.facetValueId)).sort());
        expect(result.facetValueFilters?.[1].or).toEqual([String(brand.id)]);
    });
});
