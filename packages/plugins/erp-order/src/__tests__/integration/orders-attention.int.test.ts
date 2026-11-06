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
import type { OrderListOptions } from '@vendure/common/lib/generated-types';
import type { ListQueryBuilder, RequestContext } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import type { AccessScope } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrdersAttentionService } from '../../orders-attention.service';
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

const { schema, extra } = testSchemaOptions('orders_attention');
let dataSource: DataSource;
let scope: AccessScope;
let service: OrdersAttentionService;
let pendingIds: string[] = [];
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
    // Stands in for Vendure's ListQueryBuilder: applies only the filters the service sends.
    const build = (_entity: unknown, options?: OrderListOptions) => {
        const qb = dataSource.getRepository(TestOrder).createQueryBuilder('order');
        const f = options?.filter;
        if (f?.id?.in)
            qb.andWhere(f.id.in.length ? 'order.id IN (:...ids)' : '1 = 0', { ids: f.id.in });
        if (f?.state?.eq) qb.andWhere('order.state = :st', { st: f.state.eq });
        if (f?.state?.notIn) qb.andWhere('order.state NOT IN (:...nin)', { nin: f.state.notIn });
        if (f?.orderPlacedAt?.before) {
            qb.andWhere('order.orderPlacedAt < :before', { before: f.orderPlacedAt.before });
        }
        qb.orderBy('order.orderPlacedAt', 'ASC');
        if (options?.take !== undefined) qb.limit(options.take);
        return qb;
    };
    const visibility = new OrderVisibilityService(
        { build } as unknown as ListQueryBuilder,
        {
            resolveOrderScope: async () => scope,
            applyOwnCounterpartyFilter: realScope.applyOwnCounterpartyFilter.bind(realScope),
            managerClause: realScope.managerClause.bind(realScope),
        } as unknown as AccessScopeService,
        { getGlobalDefaultBranchId: async () => 'branch-default' } as never,
    );
    service = new OrdersAttentionService(visibility, {
        findPendingPriceAdjustmentOrderIds: async () => pendingIds,
    } as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const before = new Date('2026-06-01T00:00:00Z');
const codes = (list: { items: Array<{ code: string }> }): string[] => list.items.map(o => o.code);

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
    const old = new Date('2026-01-01T10:00:00Z');
    const saved = await dataSource.getRepository(TestOrder).save([
        { code: 'mine-overdue', counterpartyId: cps.mine, orderPlacedAt: old },
        {
            code: 'mine-pending',
            counterpartyId: cps.mine,
            state: 'PaymentAuthorized',
            orderPlacedAt: old,
        },
        { code: 'other-overdue', counterpartyId: cps.other, orderPlacedAt: old },
        { code: 'other-pending', counterpartyId: cps.other, orderPlacedAt: old },
    ]);
    const idOf = (code: string): string => String(saved.find(o => o.code === code)!.id);
    pendingIds = [idOf('mine-pending'), idOf('other-pending'), idOf('mine-overdue')];
});

describe('orders attention (real Postgres)', () => {
    it('a manager sees only own orders in waiting, overdue and both', async () => {
        scope = { kind: 'own', administratorId: 'm-1' } as AccessScope;
        const result = await service.load(ctx, before);
        expect(codes(result.waiting).sort()).toEqual(['mine-overdue', 'mine-pending']);
        expect(codes(result.overdueRows)).toEqual(['mine-overdue']);
        expect(result.both.totalItems).toBe(1);
    });

    it('all-scope sees the other manager orders too', async () => {
        scope = { kind: 'all' } as AccessScope;
        const result = await service.load(ctx, before);
        expect(result.waiting.totalItems).toBe(3);
        expect(result.overdueRows.totalItems).toBe(3);
        expect(result.both.totalItems).toBe(2);
    });

    it('no pending ids gives an empty waiting list and zero both, not an error', async () => {
        scope = { kind: 'all' } as AccessScope;
        pendingIds = [];
        const result = await service.load(ctx, before);
        expect(result.waiting.totalItems).toBe(0);
        expect(result.both.totalItems).toBe(0);
        expect(result.overdueRows.totalItems).toBe(3);
    });
});
