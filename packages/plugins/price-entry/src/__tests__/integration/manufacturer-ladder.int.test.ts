import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { DiscountRuleService } from '../../discount-rule.service';
import { buildAggregates, VariantLookups } from '../../order-aggregates';
import { toFacetsAndWeight } from '../../order-preload';
import type { OrderPricingContext } from '../../price-resolution.service';

const bigintToNumber = {
    to: (v: number | null) => v,
    from: (v: string | null) => (v === null ? null : Number(v)),
};

// Plain mirror of the rule table (VendureEntity needs a bootstrapped id strategy).
@Entity('discount_rule')
class TestRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) priceTypeCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetValueCode!: string | null;
    @Column({ type: 'int' }) percent!: number;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'float', nullable: true }) minWeightKg!: number | null;
    @Column({ type: 'bigint', nullable: true, transformer: bigintToNumber })
    minAmount!: number | null;
}

const { schema, extra } = testSchemaOptions('manufacturer_ladder');
const ctx = testRequestContext;
const languageCtx = { languageCode: 'en' } as unknown as RequestContext;
const PRICE_TYPE = 'WHOLESALE';
let dataSource: DataSource;
let service: DiscountRuleService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestRule],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const connection = {
        getRepository: (c: never, entity: unknown) =>
            (entity as { name?: string }).name === 'DiscountRule'
                ? base.getRepository(c, TestRule as never)
                : { find: async () => [] },
    } as unknown as TransactionalConnection;
    service = new DiscountRuleService(connection, {} as never);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE discount_rule RESTART IDENTITY');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const day = 86_400_000;
async function seedLadder(
    maker: string,
    metric: 'minAmount' | 'minWeightKg',
    rungs: Array<[threshold: number, percent: number]>,
): Promise<void> {
    for (const [threshold, percent] of rungs) {
        await dataSource.getRepository(TestRule).save({
            erpId: `${maker}-${metric}-${threshold}`,
            priceTypeCode: PRICE_TYPE,
            facetCode: 'manufacturer',
            facetValueCode: maker,
            percent,
            validFrom: new Date(Date.now() - day),
            validTo: new Date(Date.now() + day),
            minWeightKg: metric === 'minWeightKg' ? threshold : null,
            minAmount: metric === 'minAmount' ? threshold : null,
        });
    }
}

function variantOf(maker: string | null, weight: number): ProductVariant {
    return {
        facetValues: [],
        customFields: { weight },
        product: {
            facetValues: [],
            customFields: {
                manufacturer: maker ? { externalId: maker, name: `Name of ${maker}` } : null,
            },
        },
    } as unknown as ProductVariant;
}

interface CartLine {
    variantId: string;
    maker: string | null;
    weight: number;
    price: number;
    quantity: number;
}

async function percentFor(lines: CartLine[], priced: string): Promise<number | null> {
    const byId = new Map(lines.map(l => [l.variantId, l]));
    const lookups: VariantLookups = {
        forVariant: async (_c, id) => byId.get(id)!.price,
        getVariantFacetsAndWeight: async (_c, id) => {
            const l = byId.get(id)!;
            return toFacetsAndWeight(languageCtx, variantOf(l.maker, l.weight));
        },
    };
    const line = byId.get(priced)!;
    const { facetValues, weight } = await lookups.getVariantFacetsAndWeight(ctx, priced);
    const orderContext = {
        quantity: line.quantity,
        order: {
            lines: lines.map(l => ({ productVariantId: l.variantId, quantity: l.quantity })),
        },
    } as unknown as OrderPricingContext;
    const { weightByFacet, amountByFacet } = await buildAggregates(
        lookups,
        ctx,
        priced,
        facetValues,
        weight,
        line.price,
        PRICE_TYPE,
        orderContext,
    );
    return service.getBestPercent(
        ctx,
        PRICE_TYPE,
        facetValues,
        new Date(),
        weightByFacet,
        amountByFacet,
    );
}

const facetsOf = (maker: string | null) =>
    toFacetsAndWeight(languageCtx, variantOf(maker, 1)).facetValues;

describe('manufacturer-scoped ladders (real Postgres)', () => {
    it('lists the rungs for a product of the brand, in order, and none for another brand', async () => {
        await seedLadder('maker-a', 'minAmount', [
            [300_000, 15],
            [100_000, 5],
            [200_000, 10],
        ]);

        const tiers = await service.getTiers(ctx, PRICE_TYPE, facetsOf('maker-a'), new Date());
        expect(tiers.map(t => [t.minAmount, t.percent, t.facetCode, t.facetValueCode])).toEqual([
            [100_000, 5, 'manufacturer', 'maker-a'],
            [200_000, 10, 'manufacturer', 'maker-a'],
            [300_000, 15, 'manufacturer', 'maker-a'],
        ]);
        expect(await service.getTiers(ctx, PRICE_TYPE, facetsOf('maker-b'), new Date())).toEqual(
            [],
        );
        expect(await service.getTiers(ctx, PRICE_TYPE, facetsOf(null), new Date())).toEqual([]);
    });

    it('picks the amount rung from the total of all lines of the brand', async () => {
        await seedLadder('maker-a', 'minAmount', [
            [100_000, 5],
            [200_000, 10],
            [300_000, 15],
        ]);
        const line = (id: string, price: number, quantity: number): CartLine => ({
            variantId: id,
            maker: 'maker-a',
            weight: 1,
            price,
            quantity,
        });

        expect(await percentFor([line('v1', 40_000, 2)], 'v1')).toBeNull();
        expect(await percentFor([line('v1', 40_000, 3)], 'v1')).toBe(5);
        const two = [line('v1', 40_000, 3), line('v2', 50_000, 2)];
        expect(await percentFor(two, 'v1')).toBe(10);
        expect(await percentFor(two, 'v2')).toBe(10);
        const three = [...two, line('v3', 20_000, 5)];
        expect(await percentFor(three, 'v3')).toBe(15);
    });

    it('picks the weight rung from the total weight of all lines of the brand', async () => {
        await seedLadder('maker-a', 'minWeightKg', [
            [10, 5],
            [20, 10],
            [30, 15],
        ]);
        const line = (id: string, weight: number, quantity: number): CartLine => ({
            variantId: id,
            maker: 'maker-a',
            weight,
            price: 1000,
            quantity,
        });

        expect(await percentFor([line('v1', 4, 2)], 'v1')).toBeNull();
        expect(await percentFor([line('v1', 4, 3)], 'v1')).toBe(5);
        const two = [line('v1', 4, 3), line('v2', 2.5, 4)];
        expect(await percentFor(two, 'v2')).toBe(10);
        const three = [...two, line('v3', 5, 2)];
        expect(await percentFor(three, 'v1')).toBe(15);
    });

    it('does not mix two brands in one cart', async () => {
        await seedLadder('maker-a', 'minAmount', [
            [100_000, 5],
            [200_000, 10],
        ]);
        await seedLadder('maker-b', 'minAmount', [
            [100_000, 7],
            [200_000, 12],
        ]);
        const cart: CartLine[] = [
            { variantId: 'a1', maker: 'maker-a', weight: 1, price: 60_000, quantity: 2 },
            { variantId: 'b1', maker: 'maker-b', weight: 1, price: 30_000, quantity: 1 },
            { variantId: 'n1', maker: null, weight: 1, price: 500_000, quantity: 1 },
        ];

        expect(await percentFor(cart, 'a1')).toBe(5);
        expect(await percentFor(cart, 'b1')).toBeNull();
        expect(await percentFor(cart, 'n1')).toBeNull();
    });
});
