import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { NumberingService } from '@mivend/plugin-numbering';
import { PriceEntryService } from '@mivend/plugin-price-entry';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

// #257: the DB calls addItemToOrder makes (price type, counterparty, preferred point, order number)
// must run on the request transaction; a second pool connection deadlocks once the pool is exhausted.
const POOL_SIZE = 3;
const REQUESTS = 15;
const { schema, extra } = testSchemaOptions('add_item_pool');
let dataSource: DataSource;
let priceEntry: PriceEntryService;
let counterparty: CounterpartyService;
let tradingPoint: TradingPointService;
let numbering: NumberingService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra: { ...extra, max: POOL_SIZE, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`
        CREATE TABLE session (id int PRIMARY KEY);
        CREATE TABLE counterparty (id int PRIMARY KEY, "branchId" varchar, "mainContractId" varchar);
        CREATE TABLE contract ("erpId" varchar, "isActive" boolean, "priceTypeId" varchar);
        CREATE TABLE price_type (id int PRIMARY KEY, code varchar, "externalId" varchar,
            "isActive" boolean, "isPurchase" boolean);
        CREATE TABLE customer_price_type ("customerId" varchar, "priceTypeId" int);
        CREATE TABLE customer (id int PRIMARY KEY, "userId" int, "customFieldsCounterpartyid" varchar,
            "customFieldsPreferredtradingpointid" varchar);
        CREATE TABLE trading_point (id int PRIMARY KEY, "counterpartyId" varchar, name varchar,
            "isActive" boolean, "customerStatus" varchar);
        CREATE SEQUENCE mivend_number_seq_order;
        INSERT INTO session VALUES (1);
        INSERT INTO counterparty VALUES (1, 'branch-a', 'contract-1');
        INSERT INTO contract VALUES ('contract-1', true, 'pt-ext-1');
        INSERT INTO price_type VALUES (1, 'price-type-wholesale', 'pt-ext-1', true, false);
        INSERT INTO customer VALUES (1, 7, '1', NULL);
    `);
    const connection = createTestConnection(dataSource);
    priceEntry = new PriceEntryService(connection);
    counterparty = new CounterpartyService(
        connection,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );
    tradingPoint = new TradingPointService(
        connection,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );
    numbering = new NumberingService(connection, { instanceNumberCode: '100' });
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

function addItemLikeRequest(): Promise<string> {
    return dataSource.transaction(async em => {
        const ctx = { em, activeUserId: 7 } as unknown as RequestContext;
        await em.query('SELECT id FROM session WHERE id = 1 FOR UPDATE');
        const code = await priceEntry.getPriceTypeCodeForUser(ctx);
        expect(await counterparty.getForCustomer(ctx, 1)).toMatchObject({ branchId: 'branch-a' });
        await tradingPoint.getPreferredForCustomer(ctx, 1);
        await numbering.next(ctx, 'order');
        return code ?? '';
    });
}

describe('addItemToOrder DB chain under a small pool (real Postgres)', () => {
    it(`answers ${REQUESTS} concurrent requests on one session with a pool of ${POOL_SIZE}`, async () => {
        const results = await Promise.all(Array.from({ length: REQUESTS }, addItemLikeRequest));
        expect(results).toEqual(Array(REQUESTS).fill('price-type-wholesale'));
    });
});
