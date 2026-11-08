import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    queryCountingLogger,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { MAX_CARD_REFUNDS, PaymentCardLoader } from '../../payment-card.loader';

const { schema, extra } = testSchemaOptions('payment_card_loader');
const counter = { count: 0 };
let dataSource: DataSource;
let loader: PaymentCardLoader;

const requestCtx = (channelId = 1): RequestContext => ({ channelId }) as unknown as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        logger: queryCountingLogger(counter),
    });
    await dataSource.initialize();
    await dataSource.query(`
        CREATE TABLE "order" (id serial PRIMARY KEY, code varchar NOT NULL, state varchar NOT NULL,
            "currencyCode" varchar NOT NULL, "subTotalWithTax" int NOT NULL, "shippingWithTax" int NOT NULL,
            "customerId" int);
        CREATE TABLE customer (id serial PRIMARY KEY, "customFieldsCounterpartyid" int);
        CREATE TABLE order_channels_channel ("orderId" int NOT NULL, "channelId" int NOT NULL);
        CREATE TABLE proforma_invoice (id serial PRIMARY KEY, number varchar NOT NULL, version int NOT NULL,
            amount int NOT NULL, "currencyCode" varchar NOT NULL, status varchar NOT NULL, "dueDate" timestamp NOT NULL);
        CREATE TABLE payment_refund (id serial PRIMARY KEY, "paymentId" int NOT NULL, number varchar NOT NULL,
            amount int NOT NULL, status varchar NOT NULL, reason varchar NOT NULL, "createdAt" timestamp NOT NULL);
    `);
    for (let i = 1; i <= 12; i++) {
        await dataSource.query(
            `INSERT INTO "order" (code, state, "currencyCode", "subTotalWithTax", "shippingWithTax", "customerId")
             VALUES ($1, 'PaymentSettled', 'USD', 1000, 50, $2)`,
            [`code-${i}`, i],
        );
        await dataSource.query('INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1)', [
            i === 5 ? 200 : 100,
        ]);
        await dataSource.query('INSERT INTO order_channels_channel VALUES ($1, $2)', [
            i,
            i === 12 ? 2 : 1,
        ]);
        await dataSource.query(
            `INSERT INTO proforma_invoice (number, version, amount, "currencyCode", status, "dueDate")
             VALUES ($1, $2, 1050, 'USD', 'paid', now())`,
            [`pi-${i}`, i],
        );
    }
    // Payment 1 has 60 refunds, payment 2 has two, the rest none; the day grows with the number.
    for (let n = 1; n <= 60; n++)
        await dataSource.query(
            `INSERT INTO payment_refund ("paymentId", number, amount, status, reason, "createdAt")
             VALUES (1, $1, $2, 'succeeded', 'r', '2026-01-01'::timestamp + ($2 || ' hours')::interval)`,
            [`rf-${n}`, n],
        );
    for (const n of [1, 2])
        await dataSource.query(
            `INSERT INTO payment_refund ("paymentId", number, amount, status, reason, "createdAt")
             VALUES (2, $1, $2, 'pending', 'x', '2026-02-01'::timestamp + ($2 || ' hours')::interval)`,
            [`pr-${n}`, n],
        );
    loader = new PaymentCardLoader(createTestConnection(dataSource));
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('PaymentCardLoader', () => {
    it('loads refunds for many payments in one query, grouped, newest first, capped', async () => {
        const ctx = requestCtx();
        counter.count = 0;
        const lists = await Promise.all(['1', '2', '3'].map(id => loader.refundsOf(ctx, id)));
        expect(counter.count).toBe(1);
        expect(lists[0]).toHaveLength(MAX_CARD_REFUNDS);
        expect(lists[0][0].number).toBe('rf-60');
        expect(lists[0].at(-1)?.number).toBe('rf-11');
        expect(lists[1].map(r => r.number)).toEqual(['pr-2', 'pr-1']);
        expect(lists[2]).toEqual([]);
    });

    it('loads proforma and order summaries in one query each; an order outside the channel is null', async () => {
        const ctx = requestCtx();
        counter.count = 0;
        const proformas = await Promise.all([1, 2, 3].map(id => loader.proforma(ctx, String(id))));
        expect(counter.count).toBe(1);
        expect(proformas[1]).toMatchObject({
            id: '2',
            number: 'pi-2',
            version: 2,
            amount: 1050,
            displayStatus: 'current',
        });
        expect(proformas[1]).not.toHaveProperty('status');
        counter.count = 0;
        const orders = await Promise.all(
            [1, 12, 999].map(id => loader.order(ctx, String(id), '100')),
        );
        expect(counter.count).toBe(1);
        expect(orders[0]).toMatchObject({ code: 'code-1', orderTotal: 1050, currencyCode: 'USD' });
        expect(orders[1]).toBeNull();
        expect(orders[2]).toBeNull();
    });

    it('returns null for an order whose customer belongs to another counterparty', async () => {
        const ctx = requestCtx();
        const [other, own] = await Promise.all([
            loader.order(ctx, '5', '100'),
            loader.order(ctx, '5', '200'),
        ]);
        expect(other).toBeNull();
        expect(own).toMatchObject({ code: 'code-5' });
    });
});
