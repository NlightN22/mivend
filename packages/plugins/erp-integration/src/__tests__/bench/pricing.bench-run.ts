import { afterAll, beforeAll, describe, it } from 'vitest';
import { appendFileSync } from 'fs';
import { DataSource } from 'typeorm';
import { PriceEntryService } from '@mivend/plugin-price-entry';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext as ctx,
    testSchemaOptions,
} from 'shared';

import { Logger } from '@nestjs/common';
import { PriceStreamHandler } from '../../handlers/price.handler';
import { BenchPriceEntry, PRODUCT_COUNT, createBenchTables } from './price-bench-schema';

const { schema, extra } = testSchemaOptions('price_bench');
const REPEATS = 15;
const INGEST_EVENTS = 2000;
let ds: DataSource;
let service: PriceEntryService;
let handler: PriceStreamHandler;

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ids = (from: number, count: number): string[] =>
    Array.from({ length: count }, (_, i) => String(from + i));

function report(label: string, value: string): void {
    const line = `BENCH | ${label} | ${value}`;
    console.log(line);
    if (process.env['BENCH_OUT']) appendFileSync(process.env['BENCH_OUT'], `${line}\n`);
}

async function time(label: string, fn: () => Promise<unknown>, repeats = REPEATS): Promise<void> {
    await fn();
    const runs: number[] = [];
    for (let i = 0; i < repeats; i++) {
        const t = performance.now();
        await fn();
        runs.push(performance.now() - t);
    }
    report(label, `${median(runs).toFixed(2)} ms`);
}

function priceEvent(n: number, type: string, value: number): Record<string, unknown> {
    return { productId: `erp-${n}`, priceTypeId: type, value: String(value), isActive: true };
}

beforeAll(async () => {
    Logger.overrideLogger(false);
    await createTestSchema(schema);
    ds = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [BenchPriceEntry],
    });
    await ds.initialize();
    await createBenchTables(ds);
    const base = createTestConnection(ds);
    const connection = {
        ...base,
        getRepository: (c: never, entity: unknown) =>
            typeof entity === 'function' && entity.name === 'ProductVariantPriceEntry'
                ? ds.getRepository(BenchPriceEntry)
                : base.getRepository(c, entity as never),
    } as unknown as typeof base;
    service = new PriceEntryService(connection);
    handler = new PriceStreamHandler(
        connection,
        {
            findPriceTypeByExternalId: async (_c: unknown, guid: string) => ({ code: guid }),
        } as never,
        service,
    );
});

afterAll(async () => {
    await ds.destroy();
    await dropTestSchema(schema);
});

describe('pricing benchmark (synthetic data, throwaway schema)', () => {
    it('read paths and ingest', async () => {
        await time('catalog page 100 variants: per-variant getForVariant (parallel)', () =>
            Promise.all(ids(5000, 100).map(v => service.getForVariant(ctx, v, 'WHOLESALE'))),
        );
        await time('catalog page 100 variants: batch getForVariants', () =>
            service.getForVariants(ctx, ids(5000, 100), 'WHOLESALE'),
        );
        await time('cart/order price preload, 60 lines (code + default fallback)', async () => {
            await service.getForVariants(ctx, ids(9000, 60), 'WHOLESALE');
            await service.getForVariants(ctx, ids(9000, 20), 'RETAIL');
        });
        await time(
            'bulk price build, 5000 variants',
            () => service.getForVariants(ctx, ids(1, 5000), 'RETAIL'),
            7,
        );

        const rates: number[] = [];
        const half = INGEST_EVENTS / 2;
        for (let rep = 0; rep < 3; rep++) {
            await ds.query(
                `DELETE FROM product_variant_price_entry WHERE "priceTypeCode" = 'SPECIAL'`,
            );
            const events = [
                ...Array.from({ length: half }, (_, i) => ({
                    id: `erp-${i + 1}:SPECIAL`,
                    payload: priceEvent(i + 1, 'SPECIAL', 100 + i),
                })),
                ...Array.from({ length: half }, (_, i) => ({
                    id: `erp-${i + 1}:WHOLESALE`,
                    payload: priceEvent(i + 1, 'WHOLESALE', 200 + i + rep),
                })),
            ];
            const t = performance.now();
            for (const e of events) await handler.apply(ctx, e.id, e.payload);
            rates.push(INGEST_EVENTS / ((performance.now() - t) / 1000));
        }
        report(
            `price ingest, ${INGEST_EVENTS} events (half insert, half update), ${PRODUCT_COUNT} products`,
            `${median(rates).toFixed(0)} events/s`,
        );
    });
});
