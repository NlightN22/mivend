import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    queryCountingLogger,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { activeGrantCounts } from '../../discount-grant-counts';
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

const { schema, extra } = testSchemaOptions('price_entry_grant_counts');
const counter = { count: 0 };
const ctx = testRequestContext;
const days = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
let dataSource: DataSource;
let connection: TransactionalConnection;
let service: DiscountGrantService;
let counterpartyIds: string[];

async function grant(
    number: string,
    priceTypeCode: string | null,
    validTo: Date,
    counterpartyIdx: number[] | 'all',
): Promise<void> {
    const rule = await dataSource.getRepository(TestRule).save({ priceTypeCode });
    await dataSource.getRepository(TestGrant).save({
        number,
        discountRuleId: String(rule.id),
        scopeType: counterpartyIdx === 'all' ? 'all' : 'customer',
        validTo,
        counterparties:
            counterpartyIdx === 'all'
                ? []
                : counterpartyIdx.map(i => ({ id: Number(counterpartyIds[i]) })),
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
        logger: queryCountingLogger(counter),
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(
                c,
                (byName[(entity as { name?: string }).name ?? ''] ?? entity) as never,
            ),
    } as unknown as TransactionalConnection;
    service = new DiscountGrantService(
        {} as never,
        {} as never,
        connection,
        {} as never,
        {} as never,
    );

    const saved = await dataSource
        .getRepository(TestCounterparty)
        .save(Array.from({ length: 25 }, () => ({})));
    counterpartyIds = saved.map(c => String(c.id));
    await grant('w1', 'price-type-wholesale', days(90), 'all');
    await grant('w2', 'price-type-hidden', days(90), 'all');
    await grant('w3', 'price-type-wholesale', days(-3), 'all');
    await grant('s1', 'price-type-wholesale', days(90), [0, 1, 2]);
    await grant('s2', 'price-type-wholesale', days(90), [0]);
    await grant('s3', 'price-type-hidden', days(90), [0, 3]);
    await grant('s4', null, days(2), [0, 1]);
    await grant('s5', 'price-type-wholesale', days(-1), [1]);
    await grant('s6', 'price-type-wholesale', days(120), [24]);
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

async function perRow(allowed: string[] | undefined): Promise<Map<string, number>> {
    const entries = await Promise.all(
        counterpartyIds.map(async id => {
            const result = await service.findForCounterparty(ctx, id, {
                take: 0,
                status: 'active',
                allowedPriceTypeCodes: allowed,
            });
            return [id, result.totalItems] as const;
        }),
    );
    return new Map(entries);
}

describe('activeGrantCounts (integration, real Postgres)', () => {
    it.each([
        ['an allow-list', ['price-type-wholesale']],
        ['an empty allow-list', []],
        ['no price type restriction', undefined],
    ])('equals the per-counterparty findForCounterparty totals with %s', async (_name, allowed) => {
        const batched = await activeGrantCounts(connection, ctx, counterpartyIds, allowed);
        expect(batched).toEqual(await perRow(allowed));
    });

    it('does not leak a hidden price type, nor expiring or expired grants, into the count', async () => {
        const batched = await activeGrantCounts(connection, ctx, counterpartyIds, [
            'price-type-wholesale',
        ]);
        expect(batched.get(counterpartyIds[0])).toBe(3);
        expect(batched.get(counterpartyIds[1])).toBe(2);
        expect(batched.get(counterpartyIds[10])).toBe(1);
    });

    it('returns a zero for a counterparty without grants and for unknown ids, ignoring duplicates', async () => {
        const batched = await activeGrantCounts(
            connection,
            ctx,
            ['424242', counterpartyIds[0], counterpartyIds[0]],
            [],
        );
        expect([...batched.keys()]).toEqual(['424242', counterpartyIds[0]]);
        expect(batched.get('424242')).toBe(0);
        expect(batched.get(counterpartyIds[0])).toBe(0);
    });

    it('runs two queries for 25 counterparties, as for 3', async () => {
        counter.count = 0;
        await activeGrantCounts(connection, ctx, counterpartyIds, undefined);
        const many = counter.count;
        counter.count = 0;
        await activeGrantCounts(connection, ctx, counterpartyIds.slice(0, 3), undefined);
        expect(many).toBe(2);
        expect(counter.count).toBe(many);
    });
});
