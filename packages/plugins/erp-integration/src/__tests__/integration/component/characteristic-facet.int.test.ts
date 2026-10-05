import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CharacteristicFacetService } from '../../../characteristic-facet.service';

// No full Vendure bootstrap here (same as product-category-facet-value.int.test.ts): the facet
// services are replicas of Vendure's check-then-insert-with-suffix behavior (FacetService.create
// renames a clashing code to "<code>-2"), run against real Postgres so the advisory lock is real.
const { schema, extra } = testSchemaOptions('characteristic_facet');
let dataSource: DataSource;

interface TestCtx {
    manager: EntityManager;
}

const facetService = {
    findByCode: async (ctx: TestCtx, code: string) => {
        const rows = await ctx.manager.query('select id, code from facet where code = $1', [code]);
        return rows[0];
    },
    create: async (ctx: TestCtx, input: { code: string }) => {
        let code = input.code;
        for (let n = 2; (await facetService.findByCode(ctx, code)) !== undefined; n++)
            code = `${input.code}-${n}`;
        await ctx.manager.query('select pg_sleep(0.2)');
        const rows = await ctx.manager.query('insert into facet (code) values ($1) returning id', [
            code,
        ]);
        return { id: rows[0].id, code };
    },
};

const facetValueService = {
    findByFacetId: (ctx: TestCtx, facetId: number) =>
        ctx.manager.query('select code from facet_value where "facetId" = $1', [facetId]),
    create: async (ctx: TestCtx, _facet: unknown, input: { facetId: string; code: string }) => {
        await ctx.manager.query('insert into facet_value ("facetId", code) values ($1, $2)', [
            input.facetId,
            input.code,
        ]);
    },
};

const connection = {
    withTransaction: (_ctx: unknown, work: (ctx: TestCtx) => Promise<void>) =>
        dataSource.transaction(manager => work({ manager })),
    getRepository: (ctx: TestCtx) => ({
        query: (sql: string, params: unknown[]) => ctx.manager.query(sql, params),
    }),
};

const row = (key: string, values: string[]) => ({
    group: 'attribute' as const,
    key,
    rawValue: null,
    normalizedValue: JSON.stringify(values),
    structuredJson: null,
});

function newService(): CharacteristicFacetService {
    return new CharacteristicFacetService(
        facetService as never,
        facetValueService as never,
        connection as never,
        {} as never,
        { isServer: true } as never,
    );
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
    await dataSource.query('create table facet (id serial primary key, code varchar not null)');
    await dataSource.query(
        'create table facet_value (id serial primary key, "facetId" int not null, code varchar not null)',
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('CharacteristicFacetService against real Postgres', () => {
    it('creates exactly one facet and no duplicate values when two processes race on a new key', async () => {
        const [a, b] = [newService(), newService()];
        await Promise.all([
            a.ensureValues({} as never, [row('Тип', ['минеральное', 'синтетическое'])]),
            b.ensureValues({} as never, [row('Тип', ['синтетическое', 'полусинтетическое'])]),
        ]);

        const facets = await dataSource.query(
            "select code from facet where code like 'characteristic:%'",
        );
        expect(facets).toEqual([{ code: 'characteristic:Тип' }]);
        const values = await dataSource.query('select code from facet_value order by code');
        expect(values.map((v: { code: string }) => v.code)).toEqual([
            'минеральное',
            'полусинтетическое',
            'синтетическое',
        ]);
    });

    it('is idempotent when the same event is applied again', async () => {
        const service = newService();
        const spy = vi.spyOn(facetValueService, 'create');
        await service.ensureValues({} as never, [row('Тип', ['минеральное'])]);
        expect(spy).not.toHaveBeenCalled();
    });
});
