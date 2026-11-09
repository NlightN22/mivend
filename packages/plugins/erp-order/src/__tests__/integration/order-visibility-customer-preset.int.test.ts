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

const { schema, extra } = testSchemaOptions('order_visibility_customer_preset');
let dataSource: DataSource;
let scope: AccessScope;
let visibility: OrderVisibilityService;
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
    visibility = new OrderVisibilityService(
        {
            build: (_entity: unknown, options?: { take?: number; skip?: number }) => {
                const qb = dataSource.getRepository(TestOrder).createQueryBuilder('order');
                if (options?.take) qb.limit(options.take).offset(options.skip ?? 0);
                return qb;
            },
        } as unknown as ListQueryBuilder,
        {
            resolveOrderScope: async () => scope,
            applyOwnCounterpartyFilter: realScope.applyOwnCounterpartyFilter.bind(realScope),
            managerClause: realScope.managerClause.bind(realScope),
        } as unknown as AccessScopeService,
        { getGlobalDefaultBranchId: async () => 'branch-default' } as never,
    );
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
        const customer = await dataSource
            .getRepository(TestCustomer)
            .save({ counterpartyId: String(row.id) });
        customerIds[key] = customer.id;
        await dataSource
            .getRepository(TestOrder)
            .save({ code: key, counterpartyId: String(row.id), customerId: customer.id });
    }
});

const customerIds: Record<string, number> = {};

async function codes(customerId?: number): Promise<string[]> {
    const result = await visibility.findVisible(
        ctx,
        undefined,
        undefined,
        customerId === undefined ? undefined : String(customerId),
    );
    return result.items.map(order => order.code).sort();
}

describe('customer preset on the visible orders list (real Postgres)', () => {
    it('narrows an unrestricted scope to the preset customer', async () => {
        scope = { kind: 'all' } as AccessScope;
        expect(await codes()).toEqual(['mine', 'other']);
        expect(await codes(customerIds.other)).toEqual(['other']);
    });

    it('returns the preset customer orders inside the caller scope', async () => {
        scope = { kind: 'own', administratorId: 'm-1' } as AccessScope;
        expect(await codes(customerIds.mine)).toEqual(['mine']);
    });

    it('never grants access: a customer outside the caller scope yields nothing', async () => {
        scope = { kind: 'own', administratorId: 'm-1' } as AccessScope;
        expect(await codes(customerIds.other)).toEqual([]);
    });

    it('answers take: 0 with the scoped total and no rows', async () => {
        scope = { kind: 'all' } as AccessScope;
        const all = await visibility.findVisible(ctx, { take: 0 });
        expect(all).toEqual({ items: [], totalItems: 2 });

        scope = { kind: 'own', administratorId: 'm-1' } as AccessScope;
        const own = await visibility.findVisible(ctx, { take: 0 });
        expect(own).toEqual({ items: [], totalItems: 1 });
        const forCustomer = await visibility.findVisible(
            ctx,
            { take: 0 },
            undefined,
            String(customerIds.other),
        );
        expect(forCustomer).toEqual({ items: [], totalItems: 0 });
    });
});
