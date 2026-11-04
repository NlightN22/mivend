import { In } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Order, OrderLine, type RequestContext, type TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { LookupMemo } from '../../lookup-memo';
import { OrderLineContextService } from '../../order-line-context.service';
import { OrderLineDiscountResolver } from '../../price-entry.resolver';
import { TierProgressService } from '../../tier-progress.service';
import { DiscountRuleService } from '../../discount-rule.service';
import {
    CATALOG_ENTITIES,
    PLAIN_CTX,
    buildCatalogServices,
    catalogConnection,
    createCatalogTables,
    seedCatalog,
    stubCalls,
} from './catalog-pricing-harness';
import { queryCountingLogger } from './variant-relations-harness';

class CartOrderFields {
    @Column({ type: 'varchar', name: 'erpcontractid', nullable: true }) erpContractId!:
        | string
        | null;
}

@Entity('cart_test_order')
class CartOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int', nullable: true }) customerId!: number | null;
    @Column({ type: 'int', default: 0 }) totalWithTax!: number;
    @Column(() => CartOrderFields) customFields!: CartOrderFields;
    @OneToMany(() => CartOrderLine, line => line.order) lines!: CartOrderLine[];
}

@Entity('cart_test_order_line')
class CartOrderLine {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productVariantId!: number;
    @Column({ type: 'int' }) quantity!: number;
    @ManyToOne(() => CartOrder, order => order.lines)
    @JoinColumn({ name: 'orderId' })
    order!: CartOrder;
}

const { schema, extra } = testSchemaOptions('order_line_context');
const counter = { count: 0 };
let ds: DataSource;
let connection: TransactionalConnection;
let services: ReturnType<typeof buildCatalogServices>;
let tierProgress: TierProgressService;

function newResolver(): {
    resolver: OrderLineDiscountResolver;
    lineContext: OrderLineContextService;
} {
    const lineContext = new OrderLineContextService(connection, services.resolution);
    return {
        lineContext,
        resolver: new OrderLineDiscountResolver(services.resolution, lineContext, tierProgress),
    };
}

beforeAll(async () => {
    await createTestSchema(schema);
    ds = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [...CATALOG_ENTITIES, CartOrder, CartOrderLine],
        synchronize: true,
        logging: ['query'],
        logger: queryCountingLogger(counter),
    });
    await ds.initialize();
    await createCatalogTables(ds);
    const base = catalogConnection(ds);
    connection = {
        getRepository: (ctx: RequestContext, entity: unknown) =>
            base.getRepository(
                ctx,
                (entity === Order
                    ? CartOrder
                    : entity === OrderLine
                      ? CartOrderLine
                      : entity) as never,
            ),
    } as unknown as TransactionalConnection;
    services = buildCatalogServices(ds, connection);
    tierProgress = new TierProgressService(
        services.priceEntry,
        new DiscountRuleService(connection, {} as never),
        services.resolution,
    );
});

afterAll(async () => {
    await ds.destroy();
    await dropTestSchema(schema);
});

async function placeOrder(
    customerId: number | null,
    variantIds: string[],
    quantityOf: (index: number) => number,
): Promise<string[]> {
    const order = await ds
        .getRepository(CartOrder)
        .save({ customerId, customFields: { erpContractId: null } });
    const lineIds: string[] = [];
    for (const [index, variantId] of variantIds.entries()) {
        const line = await ds.getRepository(CartOrderLine).save({
            productVariantId: Number(variantId),
            quantity: quantityOf(index),
            order,
        });
        lineIds.push(String(line.id));
    }
    return lineIds;
}

// The previous resolver body: one order load with all siblings per line and field, fresh memo per request.
async function perLine(
    ctx: RequestContext,
    lineId: string,
    memo = new LookupMemo(),
): Promise<unknown> {
    const line = await connection.getRepository(ctx, OrderLine).findOne({
        where: { id: lineId },
        relations: ['order', 'order.lines'],
    });
    const orderContext = { order: line!.order, quantity: line!.quantity };
    const { compareAtPrice } = await services.resolution.resolve(
        ctx,
        String(line!.productVariantId),
        orderContext,
        { memo },
    );
    const progress = await tierProgress.resolveTierProgress(
        ctx,
        String(line!.productVariantId),
        orderContext,
        memo,
    );
    return { compareAtPrice, progress };
}

async function batched(
    resolver: OrderLineDiscountResolver,
    ctx: RequestContext,
    lineIds: string[],
): Promise<unknown[]> {
    return Promise.all(
        lineIds.map(async id => ({
            compareAtPrice: await resolver.compareAtPrice(ctx, { id }),
            progress: await resolver.tierProgress(ctx, { id }),
        })),
    );
}

describe('cart line fields (real Postgres)', () => {
    it('equal the per-line result for every viewer kind, with tier ladders and discounts', async () => {
        const variants = await seedCatalog(ds, 40);
        const seen = new Set<string>();
        for (const user of [1, 2, 3, undefined]) {
            const ctx = PLAIN_CTX(user);
            const lineIds = await placeOrder(user ?? null, variants.slice(0, 20), i => 1 + (i % 6));
            const expected = await Promise.all(lineIds.map(id => perLine(ctx, id)));
            const actual = await batched(newResolver().resolver, ctx, lineIds);
            expect(actual).toEqual(expected);
            for (const e of expected) seen.add(JSON.stringify(e));
        }
        expect(seen.size).toBeGreaterThan(8);
    });

    it('does not grow the query count with the number of cart lines', async () => {
        const variants = await seedCatalog(ds, 60);
        const measure = async (count: number): Promise<number> => {
            const ctx = PLAIN_CTX(1);
            const lineIds = await placeOrder(1, variants.slice(0, count), i => 1 + (i % 6));
            counter.count = 0;
            await batched(newResolver().resolver, ctx, lineIds);
            return counter.count;
        };
        const small = await measure(10);
        const large = await measure(40);
        const ids = await placeOrder(1, variants.slice(0, 20), i => 1 + (i % 6));
        counter.count = 0;
        const shared = new LookupMemo();
        await Promise.all(ids.map(id => perLine(PLAIN_CTX(1), id, shared)));
        const old20 = counter.count;
        const new20 = await measure(20);
        console.log(
            `cart fields queries: per-line path 20 lines=${old20}; batched 10=${small} 20=${new20} 40=${large}`,
        );
        expect(large).toBe(small);
    });

    it('never shares results between two customers resolved in the same tick', async () => {
        const variants = await seedCatalog(ds, 20);
        const a = await placeOrder(1, variants, i => 1 + (i % 4));
        const b = await placeOrder(3, variants, i => 1 + (i % 4));
        const resolver = newResolver().resolver;
        const [ra, rb] = await Promise.all([
            batched(resolver, PLAIN_CTX(1), a),
            batched(resolver, PLAIN_CTX(3), b),
        ]);
        expect(ra).toEqual(await Promise.all(a.map(id => perLine(PLAIN_CTX(1), id))));
        expect(rb).toEqual(await Promise.all(b.map(id => perLine(PLAIN_CTX(3), id))));
        expect(ra).not.toEqual(rb);
    });

    it('fails only the line whose price lookup throws and never swallows the error', async () => {
        const variants = await seedCatalog(ds, 10);
        const ctx = PLAIN_CTX(1);
        const lineIds = await placeOrder(1, variants, () => 2);
        const { resolver } = newResolver();
        const real = services.resolution.resolve.bind(services.resolution);
        const spy = vi
            .spyOn(services.resolution, 'resolve')
            .mockImplementation(async (c, variantId, orderContext, options) => {
                if (variantId === variants[3]) throw new Error('boom');
                return real(c, variantId, orderContext, options);
            });
        try {
            const results = await Promise.allSettled(
                lineIds.map(id => resolver.compareAtPrice(ctx, { id })),
            );
            expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
            expect(results[3]).toMatchObject({ status: 'rejected' });
            expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(9);
        } finally {
            spy.mockRestore();
        }
    });

    it('fails only the lines of the order whose preload throws', async () => {
        const variants = await seedCatalog(ds, 4);
        const ctx = PLAIN_CTX(1);
        const first = await placeOrder(1, variants.slice(0, 2), () => 1);
        const second = await placeOrder(1, variants.slice(2), () => 1);
        const { resolver } = newResolver();
        const spy = vi
            .spyOn(services.resolution, 'preload')
            .mockRejectedValueOnce(new Error('preload boom'));
        try {
            const [a, b] = await Promise.allSettled([
                resolver.compareAtPrice(ctx, { id: first[0] }),
                resolver.compareAtPrice(ctx, { id: second[0] }),
            ]);
            expect(a).toMatchObject({ status: 'rejected' });
            expect(b.status).toBe('fulfilled');
        } finally {
            spy.mockRestore();
        }
    });

    it('answers null for a line that no longer exists', async () => {
        const { resolver } = newResolver();
        expect(await resolver.compareAtPrice(PLAIN_CTX(1), { id: '999999' })).toBeNull();
        expect(await resolver.tierProgress(PLAIN_CTX(1), { id: '999999' })).toBeNull();
        expect(stubCalls.count).toBeGreaterThanOrEqual(0);
    });

    it('repricing with one preloaded memo (orderRules off) equals the memo-less path with fewer queries', async () => {
        const variants = await seedCatalog(ds, 40);
        for (const user of [1, 2, 3, undefined]) {
            const ctx = PLAIN_CTX(user);
            const lineIds = await placeOrder(user ?? null, variants.slice(0, 20), i => 1 + (i % 6));
            const loaded = await connection
                .getRepository(ctx, OrderLine)
                .find({ where: { id: In(lineIds) }, relations: ['order', 'order.lines'] });
            const order = loaded[0].order;
            const reprice = (memo?: LookupMemo): Promise<unknown[]> =>
                Promise.all(
                    loaded.map(line =>
                        services.resolution.resolve(
                            ctx,
                            String(line.productVariantId),
                            { order, quantity: line.quantity },
                            { orderRules: false, memo },
                        ),
                    ),
                );
            counter.count = 0;
            const expected = await reprice();
            const without = counter.count;
            const memo = new LookupMemo();
            counter.count = 0;
            await services.resolution.preload(ctx, order, memo);
            const actual = await reprice(memo);
            console.log(
                `cart repricing 20 lines, user ${user}: ${without} -> ${counter.count} queries`,
            );
            expect(actual).toEqual(expected);
            expect(counter.count).toBeLessThan(without);
        }
    });
});
