import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ProductTaxCodeFlagService } from '../../../product-tax-code-flag.service';

// The business logic (which raw VAT code produces which flag) is already covered at the unit
// level (vat-code-resolver.test.ts, product.handler.test.ts with mocked services) per
// test-design's "minimum sufficient level" rule. What's genuinely untested there is whether
// ProductTaxCodeFlagService's TypeORM mapping/query actually round-trips against real Postgres.
//
// Same approach as plugin-reservation's reservation-reconciliation-issue.int.test.ts:
// ProductTaxCodeFlag extends VendureEntity, which needs a bootstrapped EntityIdStrategy — mirror
// the production table with a standalone TypeORM entity against real Postgres instead of using
// the real class.
@Entity('product_tax_code_flag')
class TestProductTaxCodeFlag {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) externalProductId!: string;
    @Column({ type: 'varchar' }) rawVatCode!: string;
    @Column({ type: 'varchar' }) reason!: string;
    @Column({ type: 'varchar' }) detail!: string;
    @Column({ type: 'timestamp' }) detectedAt!: Date;
}

let dataSource: DataSource;
let service: ProductTaxCodeFlagService;
const ctx = {} as RequestContext;

const { schema, extra } = testSchemaOptions('erp_integration_product_tax_code_flag');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProductTaxCodeFlag],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new ProductTaxCodeFlagService({
        getRepository: () => dataSource.getRepository(TestProductTaxCodeFlag),
    } as unknown as TransactionalConnection);
});

afterEach(async () => {
    await dataSource.getRepository(TestProductTaxCodeFlag).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('ProductTaxCodeFlagService (integration, real Postgres)', () => {
    it('persists a reported flag with the raw code and reason intact', async () => {
        await service.report(ctx, 'ext-prod-1', 'НДС18', {
            reason: 'legacy',
            detail: 'Legacy VAT rate on product, review in 1C',
        });

        const rows = await dataSource.getRepository(TestProductTaxCodeFlag).find();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            externalProductId: 'ext-prod-1',
            rawVatCode: 'НДС18',
            reason: 'legacy',
        });
    });

    it('findRecent orders flags newest-first and respects take/skip', async () => {
        for (let i = 0; i < 3; i++) {
            await service.report(ctx, `ext-prod-${i}`, 'НДС999', {
                reason: 'unrecognized',
                detail: 'unrecognized',
            });
        }

        const page = await service.findRecent(ctx, { take: 2, skip: 0 });
        expect(page.totalItems).toBe(3);
        expect(page.items).toHaveLength(2);
        expect(page.items[0].externalProductId).toBe('ext-prod-2');
    });
});
