import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    CreateDateColumn,
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
    @CreateDateColumn() createdAt!: Date;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
    @Column({ name: 'customFieldsBranchid', type: 'varchar', nullable: true })
    branchId!: string | null;
    @Column({ name: 'customFieldsTradingpointid', type: 'varchar', nullable: true })
    tradingPointId!: string | null;
    @Column({ type: 'int', nullable: true }) customerId!: number | null;
    @ManyToOne(() => TestCustomer, { createForeignKeyConstraints: false })
    @JoinColumn({ name: 'customerId' })
    customer!: TestCustomer | null;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) servicingBranchId!: string | null;
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

const { schema, extra } = testSchemaOptions('order_counterparty_join');
let dataSource: DataSource;
let scope: AccessScope;
let service: OrderVisibilityService;
const ctx = {} as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder, TestCustomer, TestTradingPoint, counterpartySchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE counterparty_team_member ("counterpartyId" varchar, "administratorId" varchar)`,
    );
    const realScope = new AccessScopeService({} as never, {} as never, {} as never);
    service = new OrderVisibilityService(
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
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const oldJoinIds = async (where: string): Promise<string[]> => {
    const rows: Array<{ code: string }> = await dataSource.query(
        `SELECT o.code FROM "order" o LEFT JOIN customer customer ON customer.id = o."customerId"
         LEFT JOIN counterparty counterparty
           ON COALESCE(o."customFieldsCounterpartyid", customer."customFieldsCounterpartyid")::text = counterparty.id::text
         WHERE ${where}`,
    );
    return rows.map(r => r.code).sort();
};

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE "order", customer, counterparty, trading_point, counterparty_team_member RESTART IDENTITY CASCADE',
    );
    const ids: string[] = [];
    for (const manager of ['m-1', 'm-2']) {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "assignedManagerId", "branchId") VALUES ($1, $2, 'branch-a') RETURNING id`,
            [`cp-${manager}`, manager],
        );
        ids.push(String(row.id));
    }
    const [{ id: customerId }]: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1) RETURNING id`,
        [ids[1]],
    );
    const cp = (code: string, own: string | null, withCustomer = false): Partial<TestOrder> => ({
        code,
        counterpartyId: own,
        customerId: withCustomer ? customerId : null,
    });
    await dataSource
        .getRepository(TestOrder)
        .save([
            cp('OWN', ids[0]),
            cp('OWN-WINS-OVER-CUSTOMER', ids[0], true),
            cp('FROM-CUSTOMER', null, true),
            cp('NO-COUNTERPARTY', null),
            cp('PADDED', `0${ids[0]}`),
            cp('NOT-NUMERIC', 'abc'),
            cp('TOO-LONG', '12345678901234567890'),
            cp('UNKNOWN-ID', '987654'),
        ]);
});

const codesFor = async (managerId: string): Promise<string[]> => {
    scope = { kind: 'own', administratorId: managerId } as AccessScope;
    return (await service.findVisible(ctx)).items.map(o => o.code).sort();
};

describe('order to counterparty join without text casts (real Postgres)', () => {
    it("takes the order's own counterparty first and the customer's only as a fallback", async () => {
        expect(await codesFor('m-1')).toEqual(['OWN', 'OWN-WINS-OVER-CUSTOMER']);
        expect(await codesFor('m-2')).toEqual(['FROM-CUSTOMER']);
    });

    it('matches no counterparty, and does not fail, for a padded, non-numeric, huge or unknown id', async () => {
        scope = { kind: 'all' } as AccessScope;
        const all = (await service.findVisible(ctx)).items.map(o => o.code).sort();
        expect(all).toHaveLength(8);
        for (const manager of ['m-1', 'm-2']) {
            const codes = await codesFor(manager);
            for (const code of ['PADDED', 'NOT-NUMERIC', 'TOO-LONG', 'UNKNOWN-ID']) {
                expect(codes).not.toContain(code);
            }
        }
    });

    it.each([
        ['manager of one account', `counterparty."assignedManagerId" = 'm-1'`, 'm-1'],
        ['manager through the customer', `counterparty."assignedManagerId" = 'm-2'`, 'm-2'],
    ])(
        'returns the same orders as the previous text-cast join for the %s',
        async (_n, where, mgr) => {
            expect(await codesFor(mgr)).toEqual(await oldJoinIds(where));
        },
    );
});
