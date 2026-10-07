import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { TransactionalConnection } from '@vendure/core';
import type { Injector, Order, RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { freightEligibilityChecker } from '../../freight-eligibility-checker';
import { freightOrderGuard, FREIGHT_NO_TRADING_POINT_MESSAGE } from '../../freight-order-guard';

// Real SQL and the real TradingPointService/checker/guard over hand-rolled tables (Vendure
// entities need bootstrap-time id strategy). Only CounterpartyService (another plugin) is replaced
// by its own join query, copied from counterparty.service.ts getForCustomer.
@Entity('contact_person')
class TestContact {
    @PrimaryGeneratedColumn() id!: number;
    @ManyToOne(() => TestPoint, p => p.contacts) tradingPoint!: Relation<TestPoint>;
}

@Entity('trading_point')
class TestPoint {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', default: 'active' }) customerStatus!: string;
    @OneToMany(() => TestContact, c => c.tradingPoint) contacts!: TestContact[];
}

const { schema, extra } = testSchemaOptions('freight_trading_point');
let dataSource: DataSource;
const ctx = {} as RequestContext;
let shippingMethodCode = 'freight-delivery';

const run = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(sql, params);

const counterpartyService = {
    async getForCustomer(_ctx: RequestContext, customerId: number) {
        const rows = await run(
            `SELECT c.* FROM counterparty c
             INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text
             WHERE cu.id = $1`,
            [customerId],
        );
        return rows[0] ?? null;
    },
};

let tradingPointService: TradingPointService;
const providers = new Map<unknown, unknown>();
const injector = { get: (token: unknown) => providers.get(token) } as unknown as Injector;

async function addBuyer(): Promise<{ customerId: number; counterpartyId: number }> {
    const [cp] = await run(`INSERT INTO counterparty DEFAULT VALUES RETURNING id`);
    const [cu] = await run(
        `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1) RETURNING id`,
        [String(cp.id)],
    );
    return { customerId: Number(cu.id), counterpartyId: Number(cp.id) };
}

async function addPoint(
    counterpartyId: number,
    name: string,
    opts: { isActive?: boolean; customerStatus?: string } = {},
): Promise<number> {
    const [p] = await run(
        `INSERT INTO trading_point ("erpId", "counterpartyId", name, "isActive", "customerStatus")
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
            `erp-${Math.random()}`,
            String(counterpartyId),
            name,
            opts.isActive ?? true,
            opts.customerStatus ?? 'active',
        ],
    );
    return Number(p.id);
}

const setPreferred = (customerId: number, pointId: number | null) =>
    run(`UPDATE customer SET "customFieldsPreferredtradingpointid" = $2 WHERE id = $1`, [
        customerId,
        pointId === null ? null : String(pointId),
    ]);

const storedPreferred = async (customerId: number) =>
    (
        await run(`SELECT "customFieldsPreferredtradingpointid" AS p FROM customer WHERE id = $1`, [
            customerId,
        ])
    )[0].p;

const preferredId = async (customerId: number) =>
    (await tradingPointService.getPreferredForCustomer(ctx, customerId))?.id;

const eligible = (customerId: number) =>
    freightEligibilityChecker.check(
        ctx,
        { customer: { id: customerId } } as Order,
        [],
        {} as never,
    );

const checkout = (customerId: number) =>
    freightOrderGuard.onTransitionStart?.('AddingItems', 'ArrangingPayment', {
        ctx,
        order: { customerId, shippingLines: [{ shippingMethodId: 1 }] } as unknown as Order,
    });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestPoint, TestContact],
        synchronize: true,
    });
    await dataSource.initialize();
    await run(`CREATE TABLE counterparty (id serial PRIMARY KEY)`);
    await run(`CREATE TABLE customer (
        id serial PRIMARY KEY, "customFieldsCounterpartyid" varchar,
        "customFieldsPreferredtradingpointid" varchar)`);

    const connection = {
        rawConnection: dataSource,
        getRepository: (_ctx: unknown, entity: unknown) =>
            entity === TransactionalConnection
                ? undefined
                : typeof entity === 'function' && entity.name === 'ShippingMethod'
                  ? { findByIds: async () => [{ code: shippingMethodCode }] }
                  : dataSource.getRepository(TestPoint),
    };
    tradingPointService = new TradingPointService(
        connection as never,
        {} as never,
        {} as never,
        {} as never,
    );
    providers.set(CounterpartyService, counterpartyService);
    providers.set(TradingPointService, tradingPointService);
    providers.set(TransactionalConnection, connection);
    void freightEligibilityChecker.init?.(injector);
    void freightOrderGuard.init?.(injector);
});

beforeEach(async () => {
    shippingMethodCode = 'freight-delivery';
    await run(`TRUNCATE trading_point, customer, counterparty RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('preferred trading point self-healing', () => {
    it('assigns the first active point (by name) and persists it', async () => {
        const buyer = await addBuyer();
        await addPoint(buyer.counterpartyId, 'B point');
        const a = await addPoint(buyer.counterpartyId, 'A point');
        expect(await preferredId(buyer.customerId)).toBe(a);
        expect(await storedPreferred(buyer.customerId)).toBe(String(a));
    });

    it('is idempotent and keeps a working choice of the customer', async () => {
        const buyer = await addBuyer();
        await addPoint(buyer.counterpartyId, 'A point');
        const chosen = await addPoint(buyer.counterpartyId, 'Z point');
        await setPreferred(buyer.customerId, chosen);
        expect(await preferredId(buyer.customerId)).toBe(chosen);
        expect(await preferredId(buyer.customerId)).toBe(chosen);
    });

    it.each([
        ['inactive', { isActive: false }],
        ['hidden by the customer', { customerStatus: 'hidden' }],
    ])('replaces a preferred point that is %s', async (_label, opts) => {
        const buyer = await addBuyer();
        const bad = await addPoint(buyer.counterpartyId, 'A bad', opts);
        const good = await addPoint(buyer.counterpartyId, 'B good');
        await setPreferred(buyer.customerId, bad);
        expect(await preferredId(buyer.customerId)).toBe(good);
    });

    it('never takes a point of another counterparty and returns null without any', async () => {
        const a = await addBuyer();
        const b = await addBuyer();
        await addPoint(b.counterpartyId, 'Other point');
        expect(await preferredId(a.customerId)).toBeUndefined();
        expect(await storedPreferred(a.customerId)).toBeNull();
    });

    it('converges on one point under concurrent reads', async () => {
        const buyer = await addBuyer();
        for (const n of ['C', 'B', 'A']) await addPoint(buyer.counterpartyId, `${n} point`);
        const ids = await Promise.all(
            Array.from({ length: 8 }, () => preferredId(buyer.customerId)),
        );
        expect(new Set(ids).size).toBe(1);
        expect(await storedPreferred(buyer.customerId)).toBe(String(ids[0]));
    });
});

describe('freight eligibility and order guard', () => {
    it('is not eligible with no points, nor with only inactive or hidden ones', async () => {
        const buyer = await addBuyer();
        expect(await eligible(buyer.customerId)).toBe(false);
        await addPoint(buyer.counterpartyId, 'Off', { isActive: false });
        await addPoint(buyer.counterpartyId, 'Hidden', { customerStatus: 'hidden' });
        expect(await eligible(buyer.customerId)).toBe(false);
    });

    it('is eligible with an active point and ignores other counterparties', async () => {
        const a = await addBuyer();
        const b = await addBuyer();
        await addPoint(b.counterpartyId, 'Other point');
        expect(await eligible(a.customerId)).toBe(false);
        await addPoint(a.counterpartyId, 'Own point');
        expect(await eligible(a.customerId)).toBe(true);
    });

    it('rejects freight checkout without a usable point and allows it with one', async () => {
        const buyer = await addBuyer();
        expect(await checkout(buyer.customerId)).toBe(FREIGHT_NO_TRADING_POINT_MESSAGE);
        await addPoint(buyer.counterpartyId, 'Off', { isActive: false });
        expect(await checkout(buyer.customerId)).toBe(FREIGHT_NO_TRADING_POINT_MESSAGE);
        await addPoint(buyer.counterpartyId, 'Own point');
        expect(await checkout(buyer.customerId)).toBeUndefined();
    });

    it('does not guard pickup orders', async () => {
        const buyer = await addBuyer();
        shippingMethodCode = 'pickup';
        expect(await checkout(buyer.customerId)).toBeUndefined();
    });
});
