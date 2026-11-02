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

@Entity('discount_grant')
class TestGrant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) discountRuleId!: string;
}

@Entity('discount_registry_entry')
class TestEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) discountRuleId!: string | null;
}

const TEST_ENTITIES: Record<string, unknown> = {
    DiscountRule: TestRule,
    DiscountGrant: TestGrant,
    DiscountRegistryEntry: TestEntry,
};

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                (TEST_ENTITIES[(entity as { name: string }).name] ?? entity) as never,
            ),
    } as unknown as TransactionalConnection;
}

const { schema, extra } = testSchemaOptions('promo_withdraw_sql');
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
        entities: [TestRule, TestGrant, TestEntry],
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
    await dataSource.query('TRUNCATE discount_rule, discount_grant, discount_registry_entry');
});

const promo = (erpId: string) => ({
    erpId,
    percent: 15,
    validFrom: new Date(Date.now() - day),
    validTo: new Date(Date.now() + day),
    triggerProductErpId: 'prod-trigger',
    triggerQuantity: 2,
    giftProductErpId: null,
    giftQuantity: null,
    operationKind: 'percent-discount' as const,
});

const quantities = new Map([['prod-trigger', 5]]);
const best = () => service.getBestPromoPercent(ctx, 'prod-trigger', new Date(), quantities);

describe('withdrawn promo rule (real Postgres)', () => {
    it('stops applying after removal and applies again after reactivation', async () => {
        await service.upsertPromoRule(ctx, promo('promo-1'));
        expect(await best()).toBe(15);

        expect(await service.removePromoRule(ctx, 'promo-1')).toBe(true);
        expect(await best()).toBeNull();

        await service.upsertPromoRule(ctx, promo('promo-1'));
        expect(await best()).toBe(15);
        expect(await dataSource.getRepository(TestRule).countBy({ erpId: 'promo-1' })).toBe(1);
    });

    it('removing an unknown rule is a no-op and a repeat removal reports false', async () => {
        await service.upsertPromoRule(ctx, promo('promo-1'));
        expect(await service.removePromoRule(ctx, 'promo-unknown')).toBe(false);
        expect(await service.removePromoRule(ctx, 'promo-1')).toBe(true);
        expect(await service.removePromoRule(ctx, 'promo-1')).toBe(false);
    });

    it('never removes a non-promo rule that shares the erpId', async () => {
        await dataSource.getRepository(TestRule).save({
            erpId: 'tier-1',
            percent: 5,
            validFrom: new Date(),
            validTo: null,
            operationKind: null,
        });
        expect(await service.removePromoRule(ctx, 'tier-1')).toBe(false);
        expect(await dataSource.getRepository(TestRule).countBy({ erpId: 'tier-1' })).toBe(1);
    });

    it.each([
        ['grant', TestGrant],
        ['registry entry', TestEntry],
    ])(
        'refuses to delete a rule referenced by a %s and keeps it applying',
        async (_name, Referrer) => {
            await service.upsertPromoRule(ctx, promo('promo-1'));
            const rule = await dataSource
                .getRepository(TestRule)
                .findOneByOrFail({ erpId: 'promo-1' });
            await dataSource
                .getRepository(Referrer as never)
                .save({ discountRuleId: String(rule.id) } as never);

            await expect(service.removePromoRule(ctx, 'promo-1')).rejects.toThrow(
                /refusing to delete/,
            );
            expect(await best()).toBe(15);
        },
    );
});
