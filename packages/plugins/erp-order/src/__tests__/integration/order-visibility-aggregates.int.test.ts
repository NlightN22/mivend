import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    EntitySchema,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { ListQueryBuilder, RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import type { AccessScope } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderVisibilityAggregatesService } from '../../order-visibility-aggregates.service';
import { OrderVisibilityService } from '../../order-visibility.service';

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) phoneNumber!: string | null;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
}

@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar', default: 'PaymentSettled' }) state!: string;
    @Column({ type: 'int', default: 0 }) subTotalWithTax!: number;
    @Column({ type: 'int', default: 0 }) shippingWithTax!: number;
    @Column({ type: 'timestamp', nullable: true }) orderPlacedAt!: Date | null;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
    @Column({ type: 'int', nullable: true }) customerId!: number | null;
    @ManyToOne(() => TestCustomer, { createForeignKeyConstraints: false })
    @JoinColumn({ name: 'customerId' })
    customer!: TestCustomer | null;
}

const counterpartySchema = new EntitySchema({
    name: 'counterparty',
    target: Counterparty,
    columns: {
        id: { type: Number, primary: true, generated: true },
        erpId: { type: String },
        legalName: { type: String, default: '' },
        shortName: { type: String, default: '' },
        inn: { type: String, nullable: true },
        assignedManagerId: { type: String, nullable: true },
        branchId: { type: String, nullable: true },
    },
});

const { schema, extra } = testSchemaOptions('order_visibility_aggregates');
let dataSource: DataSource;
let scope: AccessScope;
let service: OrderVisibilityAggregatesService;
const ctx = {} as RequestContext;
const cps: Record<string, string> = {};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder, TestCustomer, counterpartySchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE counterparty_team_member ("counterpartyId" varchar, "administratorId" varchar)`,
    );
    const realScope = new AccessScopeService({} as never, {} as never, {} as never);
    const visibility = new OrderVisibilityService(
        {
            build: () => dataSource.getRepository(TestOrder).createQueryBuilder('order'),
        } as unknown as ListQueryBuilder,
        {
            resolveOrderScope: async () => scope,
            applyOwnCounterpartyFilter: realScope.applyOwnCounterpartyFilter.bind(realScope),
            managerClause: realScope.managerClause.bind(realScope),
        } as unknown as AccessScopeService,
        { getGlobalDefaultBranchId: async () => 'branch-default' } as never,
    );
    service = new OrderVisibilityAggregatesService(visibility, {
        getRepository: () => dataSource.getRepository(TestOrder),
    } as unknown as TransactionalConnection);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE "order", customer, counterparty, counterparty_team_member RESTART IDENTITY CASCADE',
    );
    for (const [key, manager] of [
        ['mine', 'm-1'],
        ['other', 'm-2'],
    ] as const) {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "assignedManagerId") VALUES ($1, $2) RETURNING id`,
            [`cp-${key}`, manager],
        );
        cps[key] = String(row.id);
    }
    await dataSource.getRepository(TestOrder).save([
        {
            code: '1',
            counterpartyId: cps.mine,
            subTotalWithTax: 100,
            shippingWithTax: 10,
            orderPlacedAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
            code: '2',
            counterpartyId: cps.mine,
            subTotalWithTax: 200,
            shippingWithTax: 0,
            orderPlacedAt: new Date('2026-03-01T10:00:00Z'),
        },
        { code: '3', counterpartyId: cps.mine, state: 'Draft', subTotalWithTax: 5 },
        {
            code: '4',
            counterpartyId: cps.other,
            subTotalWithTax: 1000,
            orderPlacedAt: new Date('2026-02-01T10:00:00Z'),
        },
    ]);
});

describe('visible order aggregates (real Postgres)', () => {
    it('sums totals of every visible order without a row cap, inside the scope', async () => {
        scope = { kind: 'all' } as AccessScope;
        expect(await service.sumVisibleTotals(ctx)).toBe(1315);
        scope = { kind: 'own', administratorId: 'm-1' } as AccessScope;
        expect(await service.sumVisibleTotals(ctx)).toBe(315);
    });

    it('returns the latest placed date per listed counterparty and skips unplaced ones', async () => {
        scope = { kind: 'own', administratorId: 'm-1' } as AccessScope;
        const rows = await service.lastOrderDates(ctx, [cps.mine, cps.other]);
        expect(rows).toHaveLength(1);
        expect(rows[0].counterpartyId).toBe(cps.mine);
        expect(new Date(rows[0].lastOrderAt).toISOString()).toBe('2026-03-01T10:00:00.000Z');
    });

    it('answers an empty id list without querying', async () => {
        expect(await service.lastOrderDates(ctx, [])).toEqual([]);
    });
});
