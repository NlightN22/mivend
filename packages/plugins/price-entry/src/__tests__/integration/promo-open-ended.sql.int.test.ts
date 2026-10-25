import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

import { PromoDiscountRuleService } from '../../promo-discount-rule.service';

@Entity('discount_rule')
class TestRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'int' }) percent!: number;
    @Column({ type: 'varchar', nullable: true }) triggerProductErpId!: string | null;
    @Column({ type: 'double precision', nullable: true }) triggerQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) giftProductErpId!: string | null;
    @Column({ type: 'double precision', nullable: true }) giftQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) operationKind!: string | null;
    @Column({ type: 'varchar', nullable: true }) priceTypeCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetValueCode!: string | null;
    @Column({ type: 'double precision', nullable: true }) minWeightKg!: number | null;
    @Column({ type: 'bigint', nullable: true }) minAmount!: number | null;
}

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                ((entity as { name?: string }).name === 'DiscountRule'
                    ? TestRule
                    : entity) as never,
            ),
    } as unknown as TransactionalConnection;
}

const { schema, extra } = testSchemaOptions('promo_open_ended_sql');
const ctx = testRequestContext;
const day = 24 * 60 * 60 * 1000;
let dataSource: DataSource;
let service: PromoDiscountRuleService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestRule],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new PromoDiscountRuleService(mapEntity(createTestConnection(dataSource)));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestRule).clear();
});

const promo = (erpId: string, validTo: Date | null) => ({
    erpId,
    percent: 15,
    validFrom: new Date(Date.now() - day),
    validTo,
    triggerProductErpId: 'prod-trigger',
    triggerQuantity: 2,
    giftProductErpId: null,
    giftQuantity: null,
    operationKind: 'percent-discount' as const,
});

describe('open-ended promo rule (real Postgres)', () => {
    it('is stored with a NULL end date and never applied, unlike a rule with a future end', async () => {
        await service.upsertPromoRule(ctx, promo('promo-open', null));
        const stored = await dataSource
            .getRepository(TestRule)
            .findOneByOrFail({ erpId: 'promo-open' });
        expect(stored.validTo).toBeNull();

        const quantities = new Map([['prod-trigger', 5]]);
        expect(
            await service.getBestPromoPercent(ctx, 'prod-trigger', new Date(), quantities),
        ).toBeNull();

        await service.upsertPromoRule(ctx, promo('promo-bounded', new Date(Date.now() + day)));
        expect(await service.getBestPromoPercent(ctx, 'prod-trigger', new Date(), quantities)).toBe(
            15,
        );
    });
});
