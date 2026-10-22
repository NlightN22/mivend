import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { Order, TransactionalConnection } from '@vendure/core';
import type { Counterparty } from '@mivend/plugin-counterparty';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { CounterpartyDiscountRuleService } from '../../counterparty-discount-rule.service';

@Entity('discount_rule')
class TestRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean', default: true }) active!: boolean;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'varchar', nullable: true }) recipientType!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) productErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) condition!: string | null;
    @Column({ type: 'int', nullable: true }) conditionValue!: number | null;
    @Column({ type: 'int' }) percent!: number;
    @Column({ type: 'int', nullable: true }) limitAmount!: number | null;
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

const { schema, extra } = testSchemaOptions('counterparty_discount_rule_sql');
const ctx = testRequestContext;
const day = 24 * 60 * 60 * 1000;
let dataSource: DataSource;
let service: CounterpartyDiscountRuleService;

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
    service = new CounterpartyDiscountRuleService(mapEntity(createTestConnection(dataSource)));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestRule).clear();
});

async function seed(
    recipientType: string,
    recipientErpId: string,
    percent: number,
    extraValues: Partial<TestRule> = {},
): Promise<void> {
    await dataSource.getRepository(TestRule).save({
        validFrom: new Date(Date.now() - day),
        validTo: new Date(Date.now() + day),
        condition: 'byQuantity',
        conditionValue: 1,
        percent,
        ...extraValues,
        recipientType,
        recipientErpId,
    });
}

function best(withContract: boolean): Promise<number | null> {
    const order = { customFields: { erpContractId: withContract ? 'ctr-1' : null } } as Order;
    return service.getBestPercent(
        ctx,
        order,
        { erpId: 'cnt-1' } as Counterparty,
        'product-1',
        new Map([['product-1', 5]]),
        0,
        new Date(),
    );
}

describe('CounterpartyDiscountRuleService recipient rule query (real Postgres)', () => {
    it('takes the highest of the counterparty and the contract rules', async () => {
        await seed('counterparty', 'cnt-1', 10);
        await seed('contract', 'ctr-1', 15);
        expect(await best(true)).toBe(15);
        expect(await best(false)).toBe(10);
    });

    it('ignores expired, inactive and other recipients', async () => {
        await seed('counterparty', 'cnt-1', 40, { validTo: new Date(Date.now() - day) });
        await seed('counterparty', 'cnt-1', 30, { active: false });
        await seed('counterparty', 'cnt-other', 50);
        await seed('contract', 'ctr-other', 50);
        expect(await best(true)).toBeNull();
    });

    it('treats a rule without an end date as open-ended', async () => {
        await seed('contract', 'ctr-1', 12, { validTo: null });
        expect(await best(true)).toBe(12);
    });
});
