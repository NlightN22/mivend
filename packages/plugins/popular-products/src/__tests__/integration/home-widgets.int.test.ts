import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    OrderLine,
    Product,
    RequestContext,
    StockLevel,
    StockLocation,
    TransactionalConnection,
} from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import {
    TLevel,
    TLocation,
    TOrder,
    TOrderLine,
    TProduct,
    TProductChannel,
    TReservation,
    TVariant,
} from './home-widgets.entities';
import { HomeWidgetIdsService } from '../../home-widget-ids.service';
import { PopularProductsService } from '../../popular-products.service';
import { StockScopedIdsService } from '../../stock-scoped-ids.service';

const { schema, extra } = testSchemaOptions('home_widgets');
const DAY = 24 * 3600 * 1000;
const CHANNEL = 1;
const ago = (days: number): Date => new Date(Date.now() - days * DAY);
let dataSource: DataSource;
let widgets: HomeWidgetIdsService;
let popular: PopularProductsService;
let branchA: number;
let branchB: number;
const ids = new Map<string, string>();

interface Seed {
    name: string;
    createdAt?: Date;
    erpCreatedAt?: Date | null;
    onSale?: boolean;
    enabled?: boolean;
    deleted?: boolean;
    stock?: 'branch-a' | 'branch-b' | 'none';
    onHand?: number;
    reserved?: number;
    channel?: number;
    sold?: Array<[number, string]>;
}

async function seed(s: Seed): Promise<void> {
    const product = await dataSource.getRepository(TProduct).save({
        createdAt: s.createdAt ?? new Date(),
        enabled: s.enabled ?? true,
        deletedAt: s.deleted ? new Date() : null,
        customFields: { onSale: s.onSale ?? false, erpCreatedAt: s.erpCreatedAt ?? null },
    });
    await dataSource
        .getRepository(TProductChannel)
        .save({ productId: product.id, channelId: s.channel ?? CHANNEL });
    const variant = await dataSource.getRepository(TVariant).save({
        productId: product.id,
        deletedAt: null,
    });
    const where = s.stock ?? 'branch-a';
    if (where !== 'none') {
        const locationId = where === 'branch-a' ? branchA : branchB;
        await dataSource.getRepository(TLevel).save({
            productVariantId: variant.id,
            stockLocationId: locationId,
            stockOnHand: s.onHand ?? 5,
            customFields: { erpAvailableQuantity: null },
        });
        if (s.reserved) {
            await dataSource.getRepository(TReservation).save({
                productVariantId: String(variant.id),
                stockLocationId: String(locationId),
                quantity: s.reserved,
                status: 'active',
            });
        }
    }
    for (const [quantity, state] of s.sold ?? []) {
        const order = await dataSource.getRepository(TOrder).save({ state });
        await dataSource
            .getRepository(TOrderLine)
            .save({ order, productVariant: variant, quantity });
    }
    ids.set(s.name, String(product.id));
}

const viewer = (...warehouses: string[]): RequestContext =>
    ({ warehouses, channelId: CHANNEL }) as unknown as RequestContext;
const named = (list: string[]): string[] =>
    list.map(id => [...ids].find(([, value]) => value === id)![0]);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            TProduct,
            TProductChannel,
            TVariant,
            TOrder,
            TOrderLine,
            TLocation,
            TLevel,
            TReservation,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const locations = dataSource.getRepository(TLocation);
    branchA = (await locations.save({ customFields: { warehouseErpId: 'wh-a' } })).id;
    branchB = (await locations.save({ customFields: { warehouseErpId: 'wh-b' } })).id;

    await seed({ name: 'newest', createdAt: ago(1) });
    await seed({ name: 'insideWindow', createdAt: ago(6) });
    await seed({ name: 'outsideWindow', createdAt: ago(8) });
    await seed({ name: 'erpOldRecentRow', createdAt: ago(1), erpCreatedAt: ago(400) });
    await seed({ name: 'erpRecentOldRow', createdAt: ago(400), erpCreatedAt: ago(2) });
    await seed({ name: 'otherBranchOnly', createdAt: ago(1), stock: 'branch-b' });
    await seed({ name: 'noStock', createdAt: ago(1), stock: 'none' });
    await seed({ name: 'fullyReserved', createdAt: ago(1), onHand: 3, reserved: 3 });
    await seed({ name: 'partlyReserved', createdAt: ago(3), onHand: 3, reserved: 2 });
    await seed({ name: 'disabled', createdAt: ago(1), enabled: false });
    await seed({ name: 'deleted', createdAt: ago(1), deleted: true });

    await seed({ name: 'otherChannelNew', createdAt: ago(1), channel: 2 });
    await seed({ name: 'saleA', onSale: true, createdAt: ago(100) });
    await seed({ name: 'otherChannelSale', onSale: true, createdAt: ago(100), channel: 2 });
    await seed({ name: 'saleOut', onSale: true, createdAt: ago(100), stock: 'none' });
    await seed({ name: 'saleOtherBranch', onSale: true, createdAt: ago(100), stock: 'branch-b' });

    await seed({
        name: 'topSellerOut',
        createdAt: ago(100),
        stock: 'none',
        sold: [[50, 'Delivered']],
    });
    await seed({
        name: 'secondOther',
        createdAt: ago(100),
        stock: 'branch-b',
        sold: [[40, 'Delivered']],
    });
    await seed({
        name: 'bestInStock',
        createdAt: ago(100),
        sold: [
            [10, 'Delivered'],
            [5, 'PaymentSettled'],
        ],
    });
    await seed({ name: 'lesserInStock', createdAt: ago(100), sold: [[4, 'Delivered']] });
    await seed({
        name: 'otherChannelTop',
        createdAt: ago(100),
        channel: 2,
        sold: [[500, 'Delivered']],
    });
    await seed({
        name: 'disabledTop',
        createdAt: ago(100),
        enabled: false,
        sold: [[600, 'Delivered']],
    });
    await seed({
        name: 'deletedTop',
        createdAt: ago(100),
        deleted: true,
        sold: [[700, 'Delivered']],
    });
    await seed({
        name: 'onlyCancelled',
        createdAt: ago(100),
        sold: [
            [99, 'Cancelled'],
            [99, 'AddingItems'],
        ],
    });

    const repos = new Map<unknown, unknown>([
        [Product, dataSource.getRepository(TProduct)],
        [OrderLine, dataSource.getRepository(TOrderLine)],
        [StockLevel, dataSource.getRepository(TLevel)],
        [StockLocation, dataSource.getRepository(TLocation)],
    ]);
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) => repos.get(entity),
    } as unknown as TransactionalConnection;
    const scoped = new StockScopedIdsService({
        getViewerWarehouseErpIds: async (ctx: { warehouses: string[] }) => ctx.warehouses,
    } as never);
    widgets = new HomeWidgetIdsService(connection, scoped);
    popular = new PopularProductsService(connection, scoped);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('new arrivals (real Postgres)', () => {
    it('lists in-stock products in the window, newest first, using the ERP date when present', async () => {
        const result = named(await widgets.newArrivalProductIds(viewer('wh-a'), 12, 7));

        expect(result).toEqual(['newest', 'erpRecentOldRow', 'partlyReserved', 'insideWindow']);
    });

    it('excludes the window boundary, other-branch stock, no stock, full reservations, disabled and deleted', async () => {
        const result = named(await widgets.newArrivalProductIds(viewer('wh-a'), 12, 7));

        for (const name of [
            'outsideWindow',
            'erpOldRecentRow',
            'otherBranchOnly',
            'noStock',
            'fullyReserved',
            'disabled',
            'deleted',
            'otherChannelNew',
        ]) {
            expect(result, name).not.toContain(name);
        }
        expect(result).toContain('partlyReserved');
    });

    it('a viewer on the other branch sees that branch stock only', async () => {
        const result = named(await widgets.newArrivalProductIds(viewer('wh-b'), 12, 7));

        expect(result).toEqual(['otherBranchOnly']);
    });

    it('a viewer without branch warehouses sees nothing', async () => {
        expect(await widgets.newArrivalProductIds(viewer(), 12, 7)).toEqual([]);
    });

    it('returns nothing when nothing in the window has stock', async () => {
        expect(await widgets.newArrivalProductIds(viewer('wh-unknown'), 12, 7)).toEqual([]);
    });

    it('other-channel products do not eat overfetch slots', async () => {
        const result = await widgets.newArrivalProductIds(viewer('wh-a'), 1, 7);

        expect(result.length).toBe(3);
        expect(named(result)).not.toContain('otherChannelNew');
    });

    it('widens the window with sinceDays', async () => {
        const result = named(await widgets.newArrivalProductIds(viewer('wh-a'), 12, 10));

        expect(result).toContain('outsideWindow');
    });
});

describe('sale (real Postgres)', () => {
    it('lists only on-sale products in stock at the viewer branch', async () => {
        expect(named(await widgets.saleProductIds(viewer('wh-a'), 40))).toEqual(['saleA']);
        expect(named(await widgets.saleProductIds(viewer('wh-a'), 40))).not.toContain(
            'otherChannelSale',
        );
        expect(named(await widgets.saleProductIds(viewer('wh-b'), 40))).toEqual([
            'saleOtherBranch',
        ]);
        expect(await widgets.saleProductIds(viewer(), 40)).toEqual([]);
    });
});

describe('popular (real Postgres)', () => {
    it('ranks by sold quantity among in-stock products before the limit, ignoring cancelled and cart lines', async () => {
        const result = named(await popular.getPopularProductIds(viewer('wh-a'), 1));

        expect(result).toEqual(['bestInStock', 'lesserInStock']);
    });

    it('skips other-channel, disabled and deleted products even when they sell most', async () => {
        const result = named(await popular.getPopularProductIds(viewer('wh-a'), 1));

        for (const name of ['otherChannelTop', 'disabledTop', 'deletedTop']) {
            expect(result, name).not.toContain(name);
        }
    });

    it('other branch gets its own ranking', async () => {
        expect(named(await popular.getPopularProductIds(viewer('wh-b'), 1))).toEqual([
            'secondOther',
        ]);
    });
});
