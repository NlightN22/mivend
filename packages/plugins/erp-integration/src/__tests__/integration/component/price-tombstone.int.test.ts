import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { PriceEntryService } from '@mivend/plugin-price-entry';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { PriceStreamHandler } from '../../../handlers/price.handler';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

// Plain mirror of the price entry table (VendureEntity needs a bootstrapped id strategy).
@Entity('product_variant_price_entry')
class TestPriceEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) variantId!: string;
    @Column({ type: 'varchar' }) priceTypeCode!: string;
    @Column({ type: 'bigint' }) price!: number;
}

const { schema, extra } = testSchemaOptions('erp_price_tombstone');
let dataSource: DataSource;
let inbox: IntegrationInboxService;
let sourceSeq = 0;
const key = { productId: 'prod-1', priceTypeId: 'guid-1' };
const live = { ...key, value: '199.90', isActive: true };
// A real tombstone has an empty body; identity is only the entityId "productId:priceTypeId".
const tombstone = { isDeleted: true };

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent, TestPriceEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE product (id serial PRIMARY KEY, "customFieldsExternalid" varchar)`,
    );
    await dataSource.query(`CREATE TABLE product_variant (id serial PRIMARY KEY, "productId" int)`);
    inbox = new IntegrationInboxService(createTestConnection(dataSource));
});

beforeEach(async () => {
    await dataSource.query(
        `TRUNCATE integration_inbox_event, product_variant_price_entry, product, product_variant RESTART IDENTITY`,
    );
    await dataSource.query(`INSERT INTO product ("customFieldsExternalid") VALUES ('prod-1')`);
    await dataSource.query(`INSERT INTO product_variant ("productId") VALUES (1)`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

function makeProcessor(): ReturnType<typeof makeInboxProcessor> {
    const connection = {
        getRepository: (_c: RequestContext, entity: unknown) =>
            typeof entity === 'string'
                ? { query: (sql: string, params?: unknown[]) => dataSource.query(sql, params) }
                : dataSource.getRepository(TestPriceEntry),
    } as unknown as TransactionalConnection;
    const handler = new PriceStreamHandler(
        connection,
        { findPriceTypeByExternalId: async () => ({ code: 'WHOLESALE' }) } as never,
        new PriceEntryService(connection),
    );
    return makeInboxProcessor(
        dataSource,
        inbox,
        vi.fn((c: RequestContext, id: string, payload: Record<string, unknown>) =>
            handler.apply(c, id, payload),
        ),
    );
}

async function deliver(version: string, payload: Record<string, unknown>): Promise<void> {
    sourceSeq += 1;
    await inbox.enqueue(testRequestContext, {
        stream: 'price',
        entityId: 'prod-1:guid-1',
        version,
        sourceEventId: `evt-${sourceSeq}`,
        payload,
    });
    await makeProcessor().processPendingBatch();
}

const stored = (): Promise<Array<{ price: string }>> =>
    dataSource.query(`SELECT price FROM product_variant_price_entry`);

describe('price tombstone through the inbox (real Postgres)', () => {
    it('removes the stored price, and a redelivered tombstone is a harmless noop', async () => {
        await deliver('1', live);
        expect(await stored()).toEqual([{ price: '19990' }]);

        await deliver('2', tombstone);
        await deliver('2', tombstone);

        expect(await stored()).toEqual([]);
        const rows = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(rows.every(r => r.status === 'processed')).toBe(true);
    });

    it('ignores a stale upsert that arrives after the tombstone, and a later upsert restores it', async () => {
        await deliver('1', live);
        await deliver('3', tombstone);
        await deliver('2', { ...live, value: '250' });
        expect(await stored()).toEqual([]);

        await deliver('4', { ...live, value: '300' });
        expect(await stored()).toEqual([{ price: '30000' }]);
    });

    it('settles a tombstone for an unknown product without retrying', async () => {
        await dataSource.query(`TRUNCATE product, product_variant RESTART IDENTITY`);
        await deliver('1', tombstone);

        const [row] = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(row.status).toBe('processed');
        expect(await stored()).toEqual([]);
    });
});
