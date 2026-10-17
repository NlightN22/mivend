import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { DiscountRegistryService } from '../../discount-registry.service';

@Entity('discount_registry_entry')
class TestRegistryEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) approvalRequestId!: string | null;
    @Column({ type: 'varchar', nullable: true }) discountRuleId!: string | null;
    @Column({ type: 'varchar' }) status!: string;
    @Column({ type: 'varchar' }) priceTypeCode!: string;
    @Column({ type: 'varchar', nullable: true }) facetCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetValueCode!: string | null;
    @Column({ type: 'int' }) percent!: number;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp' }) validTo!: Date;
    @Column({ type: 'varchar', nullable: true }) justification!: string | null;
    @Column({ type: 'simple-json', nullable: true }) counterpartyIds!: string[] | null;
    @Column({ type: 'varchar', nullable: true }) customerNamesForSearch!: string | null;
}

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                (entity as { name?: string }).name === 'DiscountRegistryEntry'
                    ? (TestRegistryEntry as never)
                    : (entity as never),
            ),
    } as unknown as TransactionalConnection;
}

let dataSource: DataSource;
let service: DiscountRegistryService;
const { schema, extra } = testSchemaOptions('price_entry_discount_registry');
const ctx = testRequestContext;
const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const backfillItem = (approvalRequestId: string | null, discountRuleId: string | null) => ({
    approvalRequestId,
    discountRuleId,
    status: 'materialized' as const,
    input: {
        priceTypeCode: 'price-type-wholesale',
        facetCode: null,
        facetValueCode: null,
        percent: 10,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-12-31'),
        justification: null,
        counterpartyIds: null,
    },
});

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestRegistryEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new DiscountRegistryService(mapEntity(createTestConnection(dataSource)));
});

afterEach(async () => {
    await dataSource.getRepository(TestRegistryEntry).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('DiscountRegistryService locking (integration, real Postgres)', () => {
    it('markDecided with a rule id waits for a writer holding that rule key', async () => {
        await service.backfill(ctx, [backfillItem('req-1', null)]);
        const runner = dataSource.createQueryRunner();
        await runner.startTransaction();
        await runner.query(
            `select pg_advisory_xact_lock(hashtextextended('discount-registry-rule:rule-1', 0))`,
        );

        let done = false;
        const decided = service
            .markDecided(ctx, 'req-1', 'materialized', 'rule-1')
            .then(() => (done = true));
        await pause(300);
        expect(done).toBe(false);

        await runner.commitTransaction();
        await runner.release();
        await decided;
        const row = await dataSource.getRepository(TestRegistryEntry).findOneByOrFail({});
        expect(row.discountRuleId).toBe('rule-1');
    });

    it('opposite-order writers on one entry finish without deadlock and leave one row', async () => {
        await service.backfill(ctx, [backfillItem('req-1', 'rule-1')]);

        await Promise.all(
            Array.from({ length: 6 }, (_, i) =>
                i % 2 === 0
                    ? service.markDecided(ctx, 'req-1', 'materialized', 'rule-1')
                    : service.backfill(ctx, [backfillItem('req-1', 'rule-1')]),
            ),
        );

        const rows = await dataSource.getRepository(TestRegistryEntry).find();
        expect(rows).toHaveLength(1);
        expect(rows[0].discountRuleId).toBe('rule-1');
    });
});
