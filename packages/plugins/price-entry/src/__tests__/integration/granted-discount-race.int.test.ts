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

import { GrantedDiscount } from '../../granted-discount.entity';
// VendureEntity's primary column needs a bootstrapped EntityIdStrategy; a bare DataSource has none.
@Entity('granted_discount')
class TestGrantedDiscount {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar' }) sourceDocumentId!: string;
    @Column({ type: 'varchar' }) counterpartyErpId!: string;
    @Column({ type: 'varchar' }) productErpId!: string;
    @Column({ type: 'varchar', nullable: true }) orderEntityId!: string | null;
    @Column({ type: 'varchar', nullable: true }) discountDocumentId!: string | null;
    @Column({ type: 'varchar' }) discountRuleRecipientId!: string;
    @Column({ type: 'varchar', nullable: true }) condition!: string | null;
    @Column({ type: 'float' }) discountAmount!: number;
    @Column({ type: 'varchar' }) sourceVersion!: string;
    @Column({ type: 'boolean', default: false }) isDeleted!: boolean;
}

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                entity === GrantedDiscount ? (TestGrantedDiscount as never) : (entity as never),
            ),
    } as unknown as TransactionalConnection;
}

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
        entities: [TestGrantedDiscount],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new GrantedDiscountService(mapEntity(createTestConnection(dataSource)));
});

afterEach(async () => {
    await dataSource.getRepository(TestGrantedDiscount).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('GrantedDiscountService concurrency (integration, real Postgres)', () => {
    it('concurrent first upserts of one erpId leave a single row and no unique violation', async () => {
        await Promise.all([service.upsert(ctx, input('1')), service.upsert(ctx, input('1'))]);

        expect(await dataSource.getRepository(TestGrantedDiscount).count()).toBe(1);
    });

    it('a concurrent older upsert cannot resurrect a row a newer tombstone deleted', async () => {
        await service.upsert(ctx, input('1'));

        await Promise.all([service.remove(ctx, 'gd-1', '3'), service.upsert(ctx, input('2'))]);

        const row = await dataSource
            .getRepository(TestGrantedDiscount)
            .findOneByOrFail({ erpId: 'gd-1' });
        expect(row.isDeleted).toBe(true);
        expect(row.sourceVersion).toBe('3');
    });
});
