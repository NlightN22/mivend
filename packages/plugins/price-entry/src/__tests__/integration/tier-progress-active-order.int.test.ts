import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ProductVariantPriceResolver } from '../../price-entry.resolver';

// VendureEntity's primary column needs a bootstrapped EntityIdStrategy; a bare DataSource has none.
@Entity('tier_progress_test_order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) userId!: string;
    @Column({ type: 'boolean', default: true }) active!: boolean;
    @OneToMany(() => TestOrderLine, line => line.order) lines!: TestOrderLine[];
}

@Entity('tier_progress_test_order_line')
class TestOrderLine {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productVariantId!: number;
    @Column({ type: 'int' }) quantity!: number;
    @ManyToOne(() => TestOrder, order => order.lines)
    @JoinColumn({ name: 'orderId' })
    order!: TestOrder;
}

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                (entity === Order
                    ? TestOrder
                    : entity === OrderLine
                      ? TestOrderLine
                      : entity) as never,
            ),
    } as unknown as TransactionalConnection;
}

let dataSource: DataSource;
const { schema, extra } = testSchemaOptions('tier_progress_active_order');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder, TestOrderLine],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterEach(async () => {
    await dataSource.query(
        'TRUNCATE TABLE tier_progress_test_order_line, tier_progress_test_order CASCADE',
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function placeOrder(userId: string, lines: [number, number][]): Promise<void> {
    const order = await dataSource.getRepository(TestOrder).save({ userId });
    await dataSource
        .getRepository(TestOrderLine)
        .save(lines.map(([productVariantId, quantity]) => ({ productVariantId, quantity, order })));
}

function setup() {
    const resolveTierProgress = vi.fn(async () => null);
    // Mirrors Vendure: the active order is the caller's own, looked up by the session user.
    const activeOrderService = {
        getActiveOrder: async (ctx: RequestContext) => {
            const row = await dataSource
                .getRepository(TestOrder)
                .findOne({ where: { userId: String(ctx.activeUserId), active: true } });
            return row ?? undefined;
        },
    };
    const resolver = new ProductVariantPriceResolver(
        {} as never,
        activeOrderService as never,
        mapEntity(createTestConnection(dataSource)),
        { resolveTierProgress } as never,
    );
    return { resolver, resolveTierProgress };
}

const ctxOf = (activeUserId?: string): RequestContext => ({ activeUserId }) as RequestContext;

describe('ProductVariant.tierProgress active order (integration, real Postgres)', () => {
    it('hands the caller an empty order for an empty cart', async () => {
        const { resolver, resolveTierProgress } = setup();
        await resolver.tierProgress(ctxOf('u1'), { id: '5' });
        const [, , orderContext] = resolveTierProgress.mock.calls[0] as unknown as [
            unknown,
            unknown,
            { order: { lines: unknown[] }; quantity: number },
        ];
        expect(orderContext.order.lines).toEqual([]);
        expect(orderContext.quantity).toBe(0);
    });

    it("passes the caller's lines and the quantity of the variant's own line", async () => {
        await placeOrder('u1', [
            [5, 7],
            [6, 3],
        ]);
        const { resolver, resolveTierProgress } = setup();
        await resolver.tierProgress(ctxOf('u1'), { id: '5' });
        const [, variantId, orderContext] = resolveTierProgress.mock.calls[0] as unknown as [
            unknown,
            string,
            {
                order: { lines: { productVariantId: number; quantity: number }[] };
                quantity: number;
            },
        ];
        expect(variantId).toBe('5');
        expect(orderContext.quantity).toBe(7);
        expect(
            orderContext.order.lines
                .map(l => [l.productVariantId, l.quantity])
                .sort((a, b) => a[0] - b[0]),
        ).toEqual([
            [5, 7],
            [6, 3],
        ]);
    });

    it("never reads another customer's cart", async () => {
        await placeOrder('u2', [[5, 99]]);
        const { resolver, resolveTierProgress } = setup();
        await resolver.tierProgress(ctxOf('u1'), { id: '5' });
        const [, , orderContext] = resolveTierProgress.mock.calls[0] as unknown as [
            unknown,
            unknown,
            { order: { lines: unknown[] }; quantity: number },
        ];
        expect(orderContext.order.lines).toEqual([]);
        expect(orderContext.quantity).toBe(0);
    });

    it('returns null for a guest without touching any order', async () => {
        await placeOrder('u2', [[5, 99]]);
        const { resolver, resolveTierProgress } = setup();
        expect(await resolver.tierProgress(ctxOf(undefined), { id: '5' })).toBeNull();
        expect(resolveTierProgress).not.toHaveBeenCalled();
    });
});
