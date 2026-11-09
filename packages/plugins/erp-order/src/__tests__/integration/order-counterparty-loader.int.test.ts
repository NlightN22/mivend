import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderCounterpartyLoader } from '../../order-counterparty.loader';

const { schema, extra } = testSchemaOptions('order_counterparty_loader');
let dataSource: DataSource;
let loader: OrderCounterpartyLoader;
let queries = 0;
let cpIds: Record<string, string> = {};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE counterparty (id serial PRIMARY KEY, "shortName" varchar, "assignedManagerId" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE customer (id serial PRIMARY KEY, "customFieldsCounterpartyid" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE "order" (id serial PRIMARY KEY, "customerId" int, "customFieldsCounterpartyid" varchar)`,
    );
    const connection = {
        getRepository: () => ({
            query: (sql: string, params?: unknown[]) => {
                queries++;
                return dataSource.query(sql, params);
            },
        }),
    };
    loader = new OrderCounterpartyLoader(connection as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE "order", customer, counterparty RESTART IDENTITY CASCADE');
    queries = 0;
    cpIds = {};
    for (const key of ['own', 'viaCustomer']) {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("shortName", "assignedManagerId") VALUES ($1, 'm-1') RETURNING id`,
            [key],
        );
        cpIds[key] = String(row.id);
    }
});

async function addOrder(customerCp: string | null, orderCp: string | null): Promise<string> {
    const [customer]: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1) RETURNING id`,
        [customerCp],
    );
    const [order]: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO "order" ("customerId", "customFieldsCounterpartyid") VALUES ($1, $2) RETURNING id`,
        [customer.id, orderCp],
    );
    return String(order.id);
}

const names = (rows: Array<{ shortName: string } | null>): Array<string | null> =>
    rows.map(row => row?.shortName ?? null);

describe('OrderCounterpartyLoader', () => {
    it('prefers the order own counterparty over the customer one', async () => {
        const id = await addOrder(cpIds.viaCustomer, cpIds.own);
        expect(names([await loader.forOrder({} as RequestContext, id)])).toEqual(['own']);
    });

    it('falls back to the customer counterparty', async () => {
        const id = await addOrder(cpIds.viaCustomer, null);
        expect(names([await loader.forOrder({} as RequestContext, id)])).toEqual(['viaCustomer']);
    });

    it('is null when neither carries one', async () => {
        const id = await addOrder(null, null);
        expect(await loader.forOrder({} as RequestContext, id)).toBeNull();
    });

    it('resolves N orders of one request in a single query without mixing rows up', async () => {
        const ctx = {} as RequestContext;
        const ids = [
            await addOrder(null, cpIds.own),
            await addOrder(cpIds.viaCustomer, null),
            await addOrder(null, null),
        ];
        const rows = await Promise.all(ids.map(id => loader.forOrder(ctx, id)));
        expect(names(rows)).toEqual(['own', 'viaCustomer', null]);
        expect(queries).toBe(1);
    });

    it('does not return a counterparty for an order outside the requested ids', async () => {
        await addOrder(null, cpIds.own);
        const other = await addOrder(null, null);
        expect(await loader.forOrder({} as RequestContext, other)).toBeNull();
    });
});
