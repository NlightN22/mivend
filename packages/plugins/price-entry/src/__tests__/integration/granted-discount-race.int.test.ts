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

import { GrantedDiscount } from '../../granted-discount.entity';
import { GrantedDiscountService } from '../../granted-discount.service';

let dataSource: DataSource;
let service: GrantedDiscountService;
const { schema, extra } = testSchemaOptions('price_entry_granted_discount');
const ctx = testRequestContext;

const input = (sourceVersion: string) => ({
    erpId: 'gd-1',
    sourceDocumentId: 'ship-1',
    counterpartyErpId: 'cp-1',
    productErpId: 'prod-1',
    orderEntityId: null,
    discountDocumentId: null,
    discountRuleRecipientId: 'rule-1',
    condition: null,
    discountAmount: 5,
    sourceVersion,
});

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [GrantedDiscount],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new GrantedDiscountService(createTestConnection(dataSource));
});

afterEach(async () => {
    await dataSource.getRepository(GrantedDiscount).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('GrantedDiscountService concurrency (integration, real Postgres)', () => {
    it('concurrent first upserts of one erpId leave a single row and no unique violation', async () => {
        await Promise.all([service.upsert(ctx, input('1')), service.upsert(ctx, input('1'))]);

        expect(await dataSource.getRepository(GrantedDiscount).count()).toBe(1);
    });

    it('a concurrent older upsert cannot resurrect a row a newer tombstone deleted', async () => {
        await service.upsert(ctx, input('1'));

        await Promise.all([service.remove(ctx, 'gd-1', '3'), service.upsert(ctx, input('2'))]);

        const row = await dataSource
            .getRepository(GrantedDiscount)
            .findOneByOrFail({ erpId: 'gd-1' });
        expect(row.isDeleted).toBe(true);
        expect(row.sourceVersion).toBe('3');
    });
});
