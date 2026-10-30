import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Order, ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { LookupMemo } from '../../lookup-memo';
import {
    VARIANT_FACET_RELATIONS,
    preloadOrderLookups,
    toFacetsAndWeight,
} from '../../order-preload';
import { PriceResolutionService } from '../../price-resolution.service';
import {
    TestVariant,
    VARIANT_GRAPH_ENTITIES,
    queryCountingLogger,
    resetVariantGraph,
    seedVariants,
} from './variant-relations-harness';

const { schema, extra } = testSchemaOptions('variant_relations');
const counter = { count: 0 };
const ctx = { languageCode: 'en' } as unknown as RequestContext;
const maker = { externalId: 'maker-1', name: 'Maker One' };
let dataSource: DataSource;
let connection: TransactionalConnection;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: VARIANT_GRAPH_ENTITIES,
        synchronize: true,
        logging: ['query'],
        logger: queryCountingLogger(counter),
    });
    await dataSource.initialize();
    connection = {
        getRepository: (_c: unknown, entity: unknown) =>
            dataSource.getRepository(entity === ProductVariant ? TestVariant : (entity as never)),
    } as unknown as TransactionalConnection;
});

beforeEach(() => resetVariantGraph(dataSource));

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function catalogQueries(ids: number[]): Promise<number> {
    const resolution = new PriceResolutionService(
        {} as never,
        {} as never,
        connection,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );
    const memo = new LookupMemo();
    counter.count = 0;
    for (const id of ids) await resolution.getVariantFacetsAndWeight(ctx, String(id), memo);
    return counter.count;
}

async function cartQueries(ids: number[]): Promise<number> {
    const order = { lines: ids.map(id => ({ productVariantId: id })) } as unknown as Order;
    counter.count = 0;
    await preloadOrderLookups(
        connection,
        {} as never,
        ctx,
        order,
        new LookupMemo(),
        async () => null,
    );
    return counter.count;
}

describe('manufacturer relation on the variant facet load (real Postgres)', () => {
    it('the relation path in VARIANT_FACET_RELATIONS fills externalId and name', async () => {
        const [id] = await seedVariants(dataSource, 1, maker);
        const variant = await dataSource.getRepository(TestVariant).findOne({
            where: { id },
            relations: VARIANT_FACET_RELATIONS,
        });

        expect(variant?.product.customFields.manufacturer).toMatchObject(maker);
        expect(toFacetsAndWeight(ctx, variant as unknown as ProductVariant)).toEqual({
            facetValues: [
                { facetCode: 'category', valueCode: 'cat-1', name: 'Category one' },
                { facetCode: 'manufacturer', valueCode: 'maker-1', name: 'Maker One' },
            ],
            weight: 2,
        });
    });

    it('a product without a manufacturer loads a null relation and no synthetic entry', async () => {
        const [id] = await seedVariants(dataSource, 1, null);
        const variant = await dataSource.getRepository(TestVariant).findOne({
            where: { id },
            relations: VARIANT_FACET_RELATIONS,
        });

        expect(variant?.product.customFields.manufacturer).toBeNull();
        const { facetValues } = toFacetsAndWeight(ctx, variant as unknown as ProductVariant);
        expect(facetValues.map(f => f.facetCode)).toEqual(['category']);
    });
});

describe('query counts with the manufacturer relation (real Postgres)', () => {
    it('a catalog page costs the same per variant with or without a manufacturer', async () => {
        const withMaker = await seedVariants(dataSource, 10, maker);
        const one = await catalogQueries(withMaker.slice(0, 1));
        const ten = await catalogQueries(withMaker);
        await resetVariantGraph(dataSource);
        const without = await seedVariants(dataSource, 10, null);

        expect(one).toBeGreaterThan(0);
        expect(ten).toBe(one * 10);
        expect(await catalogQueries(without)).toBe(ten);
    });

    it('a cart preload costs a constant number of queries however many lines it has', async () => {
        const withMaker = await seedVariants(dataSource, 20, maker);
        const small = await cartQueries(withMaker.slice(0, 2));
        const large = await cartQueries(withMaker);
        await resetVariantGraph(dataSource);
        const without = await seedVariants(dataSource, 20, null);

        expect(small).toBeGreaterThan(0);
        expect(large).toBe(small);
        expect(await cartQueries(without)).toBe(large);
    });
});
