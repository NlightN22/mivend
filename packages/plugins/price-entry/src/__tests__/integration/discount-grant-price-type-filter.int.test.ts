import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { DiscountGrantService } from '../../discount-grant.service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
}

@Entity('discount_rule')
class TestRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) priceTypeCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetValueCode!: string | null;
    @Column({ type: 'int', default: 5 }) percent!: number;
}

@Entity('discount_grant')
class TestGrant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) number!: string;
    @Column({ type: 'varchar' }) discountRuleId!: string;
    @Column({ type: 'varchar' }) scopeType!: string;
    @Column({ type: 'timestamp' }) validTo!: Date;
    @Column({ type: 'varchar', default: 'req' }) sourceApprovalRequestId!: string;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @ManyToMany(() => TestCounterparty)
    @JoinTable({ name: 'discount_grant_counterparty' })
    counterparties!: TestCounterparty[];
}

const byName: Record<string, unknown> = {
    DiscountGrant: TestGrant,
    DiscountRule: TestRule,
    Counterparty: TestCounterparty,
};

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                (byName[(entity as { name?: string }).name ?? ''] ?? entity) as never,
            ),
    } as unknown as TransactionalConnection;
}

let dataSource: DataSource;
let service: DiscountGrantService;
const { schema, extra } = testSchemaOptions('price_entry_grant_type_filter');
const ctx = testRequestContext;
const soon = (): Date => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

async function seedGrant(priceTypeCode: string | null, number: string): Promise<void> {
    const rule = await dataSource.getRepository(TestRule).save({ priceTypeCode });
    const counterparty = await dataSource.getRepository(TestCounterparty).save({});
    await dataSource.getRepository(TestGrant).save({
        number,
        discountRuleId: String(rule.id),
        scopeType: 'customer',
        validTo: soon(),
        counterparties: [counterparty],
    });
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestRule, TestGrant],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new DiscountGrantService(
        {} as never,
        {} as never,
        mapEntity(createTestConnection(dataSource)),
        {} as never,
        {} as never,
    );
});

afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE discount_grant, discount_rule, counterparty CASCADE');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const numbers = (grants: Array<{ number: string }>): string[] => grants.map(g => g.number).sort();

describe('discount grant price type filter (integration, real Postgres)', () => {
    it('keeps rules of an allowed type and rules without a type, hides other types', async () => {
        await seedGrant('price-type-wholesale', '1');
        await seedGrant('price-type-hidden', '2');
        await seedGrant(null, '3');

        const result = await service.findExpiringSoon(ctx, 30, ['price-type-wholesale']);

        expect(numbers(result)).toEqual(['1', '3']);
    });

    it('an empty allowed list hides every typed rule but keeps the untyped one', async () => {
        await seedGrant('price-type-wholesale', '1');
        await seedGrant(null, '3');

        const result = await service.findExpiringSoon(ctx, 30, []);

        expect(numbers(result)).toEqual(['3']);
    });

    it('findForCounterparty applies the same filter', async () => {
        await seedGrant('price-type-wholesale', '1');
        await seedGrant('price-type-hidden', '2');
        const counterparties = await dataSource.getRepository(TestCounterparty).find();

        const allowed = await Promise.all(
            counterparties.map(c =>
                service.findForCounterparty(ctx, c.id, {
                    allowedPriceTypeCodes: ['price-type-wholesale'],
                }),
            ),
        );

        expect(allowed.flatMap(r => r.items.map(i => i.number)).sort()).toEqual(['1']);
    });
});
