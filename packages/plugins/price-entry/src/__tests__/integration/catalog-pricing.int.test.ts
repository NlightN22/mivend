import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CatalogPricing, CatalogPricingService } from '../../catalog-pricing.service';
import { DiscountRuleService } from '../../discount-rule.service';
import { DiscountSetupRulesService } from '../../discount-setup-rules.service';
import { PriceEntryService } from '../../price-entry.service';
import { PriceResolutionService } from '../../price-resolution.service';
import {
    CATALOG_ENTITIES,
    PLAIN_CTX,
    catalogConnection,
    createCatalogTables,
    seedCatalog,
    stubCalls,
} from './catalog-pricing-harness';
import { queryCountingLogger } from './variant-relations-harness';

const { schema, extra } = testSchemaOptions('catalog_pricing');
const counter = { count: 0 };
let ds: DataSource;
let resolution: PriceResolutionService;
let catalog: CatalogPricingService;

function build(): void {
    const connection = catalogConnection(ds);
    const priceEntry = new PriceEntryService(connection);
    const setupRules = new DiscountSetupRulesService(connection);
    resolution = new PriceResolutionService(
        priceEntry,
        new DiscountRuleService(connection, {} as never),
        connection,
        {
            findOneByUserId: async (_c: unknown, userId: number) => {
                stubCalls.count++;
                return { id: userId };
            },
        } as never,
        {
            getForCustomer: async (_c: unknown, id: string) => {
                stubCalls.count++;
                return { id, erpId: `cp-${id}`, branchId: null };
            },
        } as never,
        {
            resolveEffective: async () => {
                stubCalls.count++;
                return { defaultPriceTypeId: '2' };
            },
        } as never,
        {} as never,
        setupRules,
    );
    catalog = new CatalogPricingService(resolution, priceEntry, setupRules, connection);
}

beforeAll(async () => {
    await createTestSchema(schema);
    ds = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: CATALOG_ENTITIES,
        synchronize: true,
        logging: ['query'],
        logger: queryCountingLogger(counter),
    });
    await ds.initialize();
    await createCatalogTables(ds);
    build();
});

afterAll(async () => {
    await ds.destroy();
    await dropTestSchema(schema);
});

const perCard = async (ctx: RequestContext, id: string): Promise<CatalogPricing> => ({
    price: await resolution.resolve(ctx, id),
    tiers: await resolution.resolveTiers(ctx, id),
});

// Same call shape as the three price fields of a SearchResult.
async function batched(ctx: RequestContext, ids: string[]): Promise<CatalogPricing[]> {
    return Promise.all(
        ids.map(async id => {
            const [price, compare, tiers] = await Promise.all([
                catalog.get(ctx, id),
                catalog.get(ctx, id),
                catalog.get(ctx, id),
            ]);
            expect(compare).toBe(price);
            return { price: price.price, tiers: tiers.tiers };
        }),
    );
}

async function measure(ctx: RequestContext, ids: string[]): Promise<number> {
    counter.count = 0;
    await batched(ctx, ids);
    return counter.count;
}

describe('catalog pricing batch (real Postgres)', () => {
    it('equals the per-card result for customers with different price types and scopes', async () => {
        const ids = await seedCatalog(ds, 40);
        const seen = new Set<string>();
        for (const user of [1, 2, 3, undefined]) {
            const expected = await Promise.all(ids.map(id => perCard(PLAIN_CTX(user), id)));
            expect(await batched(PLAIN_CTX(user), ids)).toEqual(expected);
            for (const e of expected) seen.add(JSON.stringify(e.price));
        }
        const user1 = await batched(PLAIN_CTX(1), ids);
        expect(user1.some(c => c.price.customerPrice === null)).toBe(true);
        expect(user1.some(c => c.price.compareAtPrice !== null)).toBe(true);
        expect(user1.some(c => c.tiers.length > 0)).toBe(true);
        const user2 = await batched(PLAIN_CTX(2), ids);
        expect(user2[0].price.compareAtPrice).not.toBeNull();
        expect(seen.size).toBeGreaterThan(20);
    });

    it('does not grow the query count with the number of cards', async () => {
        const small = await seedCatalog(ds, 24);
        stubCalls.count = 0;
        const queriesSmall = await measure(PLAIN_CTX(2), small);
        expect(stubCalls.count).toBeLessThanOrEqual(4);
        stubCalls.count = 0;
        const large = await seedCatalog(ds, 100);
        const queriesLarge = await measure(PLAIN_CTX(2), large);
        expect(queriesLarge).toBe(queriesSmall);
        expect(queriesLarge).toBeLessThanOrEqual(14);
        expect(stubCalls.count).toBeLessThanOrEqual(4);
    });

    it('never shares results between two requests of different customers in the same tick', async () => {
        const ids = await seedCatalog(ds, 30);
        const [a, b] = await Promise.all([batched(PLAIN_CTX(1), ids), batched(PLAIN_CTX(3), ids)]);
        expect(a).toEqual(await Promise.all(ids.map(id => perCard(PLAIN_CTX(1), id))));
        expect(b).toEqual(await Promise.all(ids.map(id => perCard(PLAIN_CTX(3), id))));
        expect(a).not.toEqual(b);
    });
});
