import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';
import { CheckRegistry, MANAGER_STAGES } from '@mivend/plugin-checks';

import { DiscountLimit } from '../../discount-limit.entity';
import { DiscountLimitService } from '../../discount-limit.service';
import { PriceAdjustmentLimitCheck } from '../../price-adjustment-limit.check';
import type { PriceDirection } from '../../price-adjustment-floor.check';

// VendureEntity's primary column needs a bootstrapped EntityIdStrategy; a bare DataSource has none.
@Entity('discount_limit')
@Index(['administratorId', 'scopeKind', 'scopeRef'], { unique: true })
class TestDiscountLimit {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
    @Column({ type: 'varchar', default: 'all' }) scopeKind!: string;
    @Column({ type: 'varchar', default: '' }) scopeRef!: string;
    @Column({ type: 'double precision' }) maxDiscountPercent!: number;
}

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                entity === DiscountLimit ? (TestDiscountLimit as never) : (entity as never),
            ),
    } as unknown as TransactionalConnection;
}

let dataSource: DataSource;
let service: DiscountLimitService;
const { schema, extra } = testSchemaOptions('price_entry_discount_limit');
const ctx: RequestContext = testRequestContext;

// Minimal shape of the tables loadProductAttributes reads: two products of one manufacturer, one of another.
// The manufacturer relation column is not a declared custom field name, so it is spelled here only.
const MAKER_COLUMN = `"customFields${'Manufacturerid'}"`;
const PRODUCT_TABLES = `
CREATE TABLE manufacturer (id serial PRIMARY KEY, "externalId" varchar);
CREATE TABLE product (id serial PRIMARY KEY, "customFieldsExternalid" varchar, ${MAKER_COLUMN} int);
CREATE TABLE product_variant (id serial PRIMARY KEY, "productId" int, "deletedAt" timestamp);
CREATE TABLE product_variant_facet_values_facet_value ("productVariantId" int, "facetValueId" int);
CREATE TABLE product_facet_values_facet_value ("productId" int, "facetValueId" int);
CREATE TABLE facet_value (id serial PRIMARY KEY, code varchar, "facetId" int);
CREATE TABLE facet (id serial PRIMARY KEY, code varchar);
CREATE TABLE collection_translation ("baseId" int, slug varchar);
CREATE TABLE collection_closure (id_ancestor int, id_descendant int);
INSERT INTO manufacturer ("externalId") VALUES ('brand-a'), ('brand-b');
INSERT INTO product ("customFieldsExternalid", ${MAKER_COLUMN}) VALUES ('p-a1', 1), ('p-a2', 1), ('p-b1', 2), ('p-none', NULL);
`;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestDiscountLimit],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(PRODUCT_TABLES);
    service = new DiscountLimitService(mapEntity(createTestConnection(dataSource)), {} as never);
});

beforeEach(async () => {
    await dataSource.getRepository(TestDiscountLimit).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const ceiling = async (admin: string | null, product: string) =>
    (await service.ceilingsForProducts(ctx, admin, [product])).get(product);

describe('DiscountLimitService (integration, real Postgres)', () => {
    it('has a 0% ceiling for everyone while the table is empty', async () => {
        expect(await ceiling('1', 'p-a1')).toBe(0);
    });

    it('limits only the manufacturer it names; other products fall back to the all-products row or none', async () => {
        await service.setLimit(ctx, '1', 'manufacturer', 'brand-a', 3);
        expect(await ceiling('1', 'p-a1')).toBe(3);
        expect(await ceiling('1', 'p-a2')).toBe(3);
        expect(await ceiling('1', 'p-b1')).toBe(0);
        expect(await ceiling('1', 'p-none')).toBe(0);
        await service.setLimit(ctx, '1', 'all', '', 8);
        expect(await ceiling('1', 'p-b1')).toBe(8);
        expect(await ceiling('1', 'p-a1')).toBe(8);
    });

    it('takes the deepest matching percent among the rows of one employee', async () => {
        await service.setLimit(ctx, '1', 'all', '', 5);
        await service.setLimit(ctx, '1', 'manufacturer', 'brand-a', 2);
        await service.setLimit(ctx, '1', 'manufacturer', 'brand-b', 20);
        expect(await ceiling('1', 'p-a1')).toBe(5);
        expect(await ceiling('1', 'p-b1')).toBe(20);
    });

    it('keeps the limits of different employees apart', async () => {
        await service.setLimit(ctx, '1', 'all', '', 5);
        await service.setLimit(ctx, '2', 'all', '', 12);
        expect(await ceiling('3', 'p-a1')).toBe(0);
        expect(await ceiling(null, 'p-a1')).toBe(0);
        expect(await ceiling('1', 'p-a1')).toBe(5);
        expect(await ceiling('2', 'p-a1')).toBe(12);
        expect(await service.list(ctx, '2')).toHaveLength(1);
    });

    it('keeps one row per employee and scope when the same limit is set concurrently', async () => {
        await Promise.all(
            [1, 2, 3, 4, 5, 6].map(percent =>
                service.setLimit(ctx, '1', 'manufacturer', 'brand-a', percent),
            ),
        );
        const rows = await dataSource.getRepository(TestDiscountLimit).find();
        expect(rows).toHaveLength(1);
        expect(rows[0].maxDiscountPercent).toBeGreaterThanOrEqual(1);
    });

    it('ends consistent when a limit is set and removed concurrently', async () => {
        await service.setLimit(ctx, '1', 'all', '', 5);
        await Promise.all([
            service.setLimit(ctx, '1', 'all', '', 9),
            service.removeLimit(ctx, '1', 'all', ''),
            service.setLimit(ctx, '1', 'all', '', 7),
        ]);
        const rows = await dataSource.getRepository(TestDiscountLimit).find();
        expect(rows.length).toBeLessThanOrEqual(1);
    });

    it('removes a limit, after which the product has none', async () => {
        await service.setLimit(ctx, '1', 'all', '', 5);
        expect(await service.removeLimit(ctx, '1', 'all', '')).toBe(true);
        expect(await service.removeLimit(ctx, '1', 'all', '')).toBe(false);
        expect(await ceiling('1', 'p-a1')).toBe(0);
    });
});

describe('adjust-price limit check against stored limits (integration)', () => {
    const connection = {
        getRepository: () => ({
            findOne: async () => ({ product: { customFields: { externalId: 'p-a1' } } }),
        }),
    } as unknown as TransactionalConnection;

    function run(direction: PriceDirection, requestedPrice: number) {
        const registry = new CheckRegistry();
        const check = new PriceAdjustmentLimitCheck(registry, connection, {
            actorAdministratorId: async () => '1',
            ceilingsForProducts: service.ceilingsForProducts.bind(service),
        } as never);
        check.onModuleInit();
        return {
            registry,
            findings: check.evaluate(
                {
                    roleCodes: ['manager'],
                    branchId: null,
                    params: {
                        variantId: 'v1',
                        requestedPrice,
                        referencePrice: 100,
                        direction,
                    },
                },
                { ctx, stage: MANAGER_STAGES.adjustPrice, recipient: null },
            ),
        };
    }

    it('raises a finding whose default consequence is require-approval past the ceiling, where no row means a 0% ceiling', async () => {
        expect(await run('increases-discount', 50).findings).toHaveLength(1);
        expect(await run('increases-discount', 100).findings).toEqual([]);
        await service.setLimit(ctx, '1', 'manufacturer', 'brand-a', 10);
        const { registry, findings } = run('increases-discount', 50);
        expect(await findings).toHaveLength(1);
        const provider = registry.getCheck('manager.price-adjustment-discount-limit');
        expect(registry.defaultConsequence(provider!, MANAGER_STAGES.adjustPrice)).toBe(
            'require-approval',
        );
        expect(await run('increases-discount', 95).findings).toEqual([]);
        expect(await run('reduces-discount', 50).findings).toEqual([]);
        await service.setLimit(ctx, '1', 'manufacturer', 'brand-a', 60);
        expect(await run('increases-discount', 50).findings).toEqual([]);
    });
});
