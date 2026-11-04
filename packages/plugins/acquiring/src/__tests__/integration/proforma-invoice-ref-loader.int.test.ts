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

import { ProformaInvoiceRefLoader } from '../../proforma-invoice-ref-loader.service';

const { schema, extra } = testSchemaOptions('proformaInvoice_ref_loader');
const counter = { count: 0 };
let dataSource: DataSource;
let loader: ProformaInvoiceRefLoader;

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
        CREATE TABLE "order" (id serial PRIMARY KEY, code varchar NOT NULL);
        CREATE TABLE order_channels_channel ("orderId" int NOT NULL, "channelId" int NOT NULL);
        CREATE TABLE proforma_invoice (id serial PRIMARY KEY, number varchar NOT NULL, version int NOT NULL);
    `);
    for (let i = 1; i <= 25; i++) {
        await dataSource.query('INSERT INTO "order" (code) VALUES ($1)', [`code-${i}`]);
        await dataSource.query(
            'INSERT INTO order_channels_channel ("orderId", "channelId") VALUES ($1, $2)',
            [i, i === 25 ? 2 : 1],
        );
        await dataSource.query('INSERT INTO proforma_invoice (number, version) VALUES ($1, $2)', [
            `pi-${i}`,
            i,
        ]);
    }
    loader = new ProformaInvoiceRefLoader(createTestConnection(dataSource));
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('ProformaInvoiceRefLoader', () => {
    it('resolves 20 order refs in one query with the per-row values', async () => {
        const ctx = requestCtx();
        counter.count = 0;
        const refs = await Promise.all(
            Array.from({ length: 20 }, (_, i) => loader.order(ctx, i + 1)),
        );
        expect(counter.count).toBe(1);
        expect(refs[3]).toEqual({ id: '4', code: 'code-4' });
        expect(refs.map(r => r.code)).toEqual(
            Array.from({ length: 20 }, (_, i) => `code-${i + 1}`),
        );
    });

    it('resolves 20 version refs with one query, as many as 5 refs in separate requests would each take', async () => {
        counter.count = 0;
        await Promise.all([1, 2, 3, 4, 5].map(id => loader.version(requestCtx(), id)));
        const five = counter.count;
        const ctx = requestCtx();
        counter.count = 0;
        const refs = await Promise.all(
            Array.from({ length: 20 }, (_, i) => loader.version(ctx, i + 1)),
        );
        expect(five).toBe(5);
        expect(counter.count).toBe(1);
        expect(refs[6]).toEqual({ id: '7', number: 'pi-7', version: 7 });
    });

    it('returns null for a missing version and fails only the order outside the ctx channel', async () => {
        const ctx = requestCtx();
        const [missing, ok, outside] = await Promise.allSettled([
            loader.version(ctx, 9999),
            loader.order(ctx, 1),
            loader.order(ctx, 25),
        ]);
        expect(missing).toEqual({ status: 'fulfilled', value: null });
        expect(ok.status).toBe('fulfilled');
        expect(outside.status).toBe('rejected');
    });

    it('does not share results between requests (separate ctx, separate batch)', async () => {
        const other = requestCtx(2);
        const [inOther, inFirst] = await Promise.allSettled([
            loader.order(other, 25),
            loader.order(requestCtx(), 25),
        ]);
        expect(inOther.status).toBe('fulfilled');
        expect(inFirst.status).toBe('rejected');
    });
});
