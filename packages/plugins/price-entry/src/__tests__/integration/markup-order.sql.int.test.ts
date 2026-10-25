import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { Injector, Order, OrderLine, ProductVariant, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { DiscountSetupRulesService } from '../../discount-setup-rules.service';
import { DiscountSetupService } from '../../discount-setup.service';
import {
    ORDER_DISCOUNT_CONDITION_CODE,
    orderDiscountAction,
    orderDiscountCondition,
} from '../../order-discount.promotion';
import { OrderDiscountService } from '../../order-discount.service';
import { PriceResolutionService } from '../../price-resolution.service';
import {
    QUANTITY_KIND,
    SETUP_ENTITIES,
    mapSetupEntities,
    resetSetupTables,
} from './discount-setup-harness';

const variant = {
    id: 1,
    facetValues: [],
    product: { facetValues: [], customFields: { externalId: 'product-1' } },
    customFields: { weight: 0 },
};

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    const mapped = mapSetupEntities(base);
    return {
        withTransaction: mapped.withTransaction.bind(mapped),
        getRepository: (ctx: never, entity: unknown) =>
            entity === ProductVariant
                ? { findOne: async () => variant }
                : mapped.getRepository(ctx, entity as never),
    } as unknown as TransactionalConnection;
}

const { schema, extra } = testSchemaOptions('markup_order_sql');
const ctx = { ...testRequestContext, activeUserId: 7 } as typeof testRequestContext;
const day = 24 * 60 * 60 * 1000;
const LIST = 1000;
let dataSource: DataSource;
let resolution: PriceResolutionService;
let setups: DiscountSetupService;
let seeded = 0;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: SETUP_ENTITIES,
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = mapEntity(createTestConnection(dataSource));
    resolution = new PriceResolutionService(
        {
            getPriceTypeCodeForCustomer: async () => 'RETAIL',
            getPriceTypeCodeForUser: async () => 'RETAIL',
            getPriceTypeCodeById: async () => 'RETAIL',
            getForVariant: async () => LIST,
        } as never,
        { getBestPercent: async () => null } as never,
        connection,
        { findOneByUserId: async () => ({ id: 1 }) } as never,
        { getForCustomer: async () => ({ id: 1, erpId: 'cnt-1', branchId: null }) } as never,
        { resolveEffective: async () => null } as never,
        { getBestPromoPercent: async () => null } as never,
        new DiscountSetupRulesService(connection),
    );
    setups = new DiscountSetupService(connection);
    vi.spyOn(resolution, 'preload').mockResolvedValue(undefined);
    await orderDiscountCondition.init({
        get: () => new OrderDiscountService(resolution),
    } as unknown as Injector);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await resetSetupTables(dataSource);
});

async function seed(percent: number, conditionValue: number): Promise<void> {
    seeded += 1;
    await setups.apply(ctx, {
        setup: {
            erpId: `setup-${seeded}`,
            documentNumber: '',
            percent,
            conditionName: QUANTITY_KIND,
            conditionNumber: conditionValue,
            priceTypeErpId: null,
            limitPercent: null,
            validFrom: new Date(Date.now() - day),
            validTo: new Date(Date.now() + day),
            active: true,
            inactiveReason: null,
            allProducts: true,
            productMode: 'list',
            productFilter: null,
            sourceVersion: '1',
        },
        recipients: [{ counterpartyErpId: 'cnt-1', contractErpId: '' }],
        productErpIds: [],
    });
}

function orderOf(quantity: number): Order {
    return {
        id: 1,
        customerId: 1,
        customFields: {},
        lines: [
            new OrderLine({
                id: 10,
                productVariantId: 1,
                quantity,
                listPrice: LIST,
                listPriceIncludesTax: true,
                orderPlacedQuantity: 0,
                adjustments: [],
                taxLines: [{ taxRate: 20, description: 'VAT' }],
            }),
        ],
    } as unknown as Order;
}

// Mirrors Vendure's applyOrderItemPromotions for the single mivend promotion: the strategy's list price, then the item adjustment.
async function priceOrder(
    quantity: number,
): Promise<{ line: OrderLine; total: number; compareAtPrice: number | null }> {
    const order = orderOf(quantity);
    const line = order.lines[0];
    const listed = await resolution.resolve(ctx, '1', { order, quantity }, { orderRules: false });
    line.listPrice = listed.customerPrice ?? LIST;
    const state = await orderDiscountCondition.check(ctx, order, [], {} as never);
    if (state) {
        const perUnit = orderDiscountAction.execute(
            ctx,
            line,
            [],
            { [ORDER_DISCOUNT_CONDITION_CODE]: state } as never,
            {} as never,
        ) as number;
        line.addAdjustment({
            amount: Math.round(perUnit * quantity),
            type: 'PROMOTION' as never,
            adjustmentSource: 'p',
            description: 'd',
            data: {},
        });
    }
    const { compareAtPrice } = await resolution.resolve(ctx, '1', { order, quantity });
    return { line, total: line.proratedLinePriceWithTax, compareAtPrice };
}

describe('markup discount rule through an order (real Postgres)', () => {
    it('raises the line price and order total above the list price, with no discount indication', async () => {
        await seed(-5, 1);
        const { line, total, compareAtPrice } = await priceOrder(2);
        expect(line.proratedUnitPriceWithTax).toBe(1050);
        expect(total).toBe(2100);
        expect(compareAtPrice).toBeNull();
    });

    it('lets a better positive rule at the same quantity win over the markup', async () => {
        await seed(-5, 1);
        await seed(10, 1);
        const { line, compareAtPrice } = await priceOrder(2);
        expect(line.proratedUnitPriceWithTax).toBe(900);
        expect(compareAtPrice).toBe(LIST);
    });

    it('applies a threshold markup only when the threshold is reached', async () => {
        await seed(-5, 10);
        expect((await priceOrder(9)).line.proratedUnitPriceWithTax).toBe(LIST);
        expect((await priceOrder(10)).line.proratedUnitPriceWithTax).toBe(1050);
    });

    it('catalog, cart and order agree for a threshold-0 markup and ignore a threshold rule in the catalog', async () => {
        await seed(-5, 0);
        const catalog = await resolution.resolve(ctx, '1');
        const { line } = await priceOrder(3);
        expect(catalog).toEqual({ customerPrice: 1050, compareAtPrice: null });
        expect(line.proratedUnitPriceWithTax).toBe(catalog.customerPrice);
        await seed(-6, 5);
        expect((await resolution.resolve(ctx, '1')).customerPrice).toBe(1050);
    });
});

describe('markup over several lines (real Postgres)', () => {
    async function priceLines(quantities: number[]): Promise<number[]> {
        const lines = quantities.map(
            (quantity, i) =>
                new OrderLine({
                    id: 20 + i,
                    productVariantId: 1 + i,
                    quantity,
                    listPrice: LIST,
                    listPriceIncludesTax: true,
                    orderPlacedQuantity: 0,
                    adjustments: [],
                    taxLines: [{ taxRate: 20, description: 'VAT' }],
                }),
        );
        const order = { id: 1, customerId: 1, customFields: {}, lines } as unknown as Order;
        const state = await orderDiscountCondition.check(ctx, order, [], {} as never);
        for (const line of lines) {
            const perUnit = state
                ? (orderDiscountAction.execute(
                      ctx,
                      line,
                      [],
                      { [ORDER_DISCOUNT_CONDITION_CODE]: state } as never,
                      {} as never,
                  ) as number)
                : 0;
            line.addAdjustment({
                amount: Math.round(perUnit * line.quantity),
                type: 'PROMOTION' as never,
                adjustmentSource: 'p',
                description: 'd',
                data: {},
            });
        }
        return lines.map(l => l.proratedLinePriceWithTax);
    }

    it('marks up every line once the order quantity threshold is reached, and the lines sum to the total', async () => {
        await seed(-5, 5);
        const totals = await priceLines([2, 3]);
        expect(totals).toEqual([2100, 3150]);
        expect(totals.reduce((a, b) => a + b, 0)).toBe(5250);
        expect(await priceLines([2, 2])).toEqual([2000, 2000]);
    });
});
