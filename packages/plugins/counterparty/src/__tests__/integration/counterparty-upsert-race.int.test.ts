import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';
import { Counterparty } from '../../entities/counterparty.entity';

const { schema, extra } = testSchemaOptions('counterparty_upsert_race');
let dataSource: DataSource;
let service: CounterpartyService;
const published: string[] = [];
const ctx = testRequestContext;

const payload = (legalName: string) => ({
    erpId: 'cp-erp-1',
    legalName,
    shortName: legalName,
    creditLimit: 0,
    creditBalance: 0,
    paymentDelayDays: 0,
    priceType: 'retail',
    isActive: true,
});

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [Counterparty],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new CounterpartyService(
        createTestConnection(dataSource),
        {} as never,
        {} as never,
        {} as never,
        { publish: (e: { erpId: string }) => published.push(e.erpId) } as never,
    );
});

afterEach(async () => {
    published.length = 0;
    await dataSource.getRepository(Counterparty).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('CounterpartyService upsert concurrency (integration, real Postgres)', () => {
    it('parallel upserts of a new erpId insert one row, publish created once and do not fail', async () => {
        await Promise.all([service.upsert(ctx, payload('A')), service.upsert(ctx, payload('B'))]);

        expect(await dataSource.getRepository(Counterparty).count()).toBe(1);
        expect(published).toEqual(['cp-erp-1']);
    });

    it('parallel upsertActiveState calls for a new erpId insert one row', async () => {
        const results = await Promise.all([
            service.upsertActiveState(ctx, 'cp-erp-2', { name: 'A', isActive: true }),
            service.upsertActiveState(ctx, 'cp-erp-2', { name: 'B', isActive: true }),
        ]);

        expect(results).toEqual([true, true]);
        expect(await dataSource.getRepository(Counterparty).countBy({ erpId: 'cp-erp-2' })).toBe(1);
    });
});
