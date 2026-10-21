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

const { schema, extra } = testSchemaOptions('order_read_time_branch');
let dataSource: DataSource;
let scope: AccessScope;
let service: OrderVisibilityService;
const ctx = {} as RequestContext;
const cps: Record<string, string> = {};

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

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE "order", customer, counterparty, trading_point, counterparty_team_member RESTART IDENTITY CASCADE',
    );
    for (const [key, manager, branch] of [
        ['a', 'm-a', 'branch-a'],
        ['b', 'm-b', 'branch-b'],
        ['none', 'm-none', null],
    ] as const) {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "assignedManagerId", "branchId") VALUES ($1, $2, $3) RETURNING id`,
            [`cp-${key}`, manager, branch],
        );
        cps[key] = String(row.id);
    }
    const points = await dataSource
        .getRepository(TestTradingPoint)
        .save([{ servicingBranchId: 'branch-b' }, { servicingBranchId: null }]);
    await dataSource.getRepository(TestOrder).save([
        { code: 'A-POINT-B', counterpartyId: cps.a, tradingPointId: String(points[0].id) },
        { code: 'A-POINT-NONE', counterpartyId: cps.a, tradingPointId: String(points[1].id) },
        { code: 'A-NO-POINT', counterpartyId: cps.a, branchId: 'branch-b' },
        { code: 'B-EXTERNAL', counterpartyId: cps.b, branchId: null },
        { code: 'NONE-DEFAULT', counterpartyId: cps.none },
    ]);
});

const visibleFor = async (
    branchId: string,
    extra: Partial<AccessScope> = {},
): Promise<string[]> => {
    scope = { kind: 'department', branchId, ...extra } as AccessScope;
    return (await service.findVisible(ctx)).items.map(o => o.code).sort();
};

describe('order branch resolved at read time for department scope (#263, real Postgres)', () => {
    it('a trading point servicing branch overrides the counterparty branch', async () => {
        expect(await visibleFor('branch-b')).toContain('A-POINT-B');
        expect(await visibleFor('branch-a')).not.toContain('A-POINT-B');
    });

    it('uses the counterparty branch without a point or with a point lacking a servicing branch', async () => {
        expect(await visibleFor('branch-a')).toEqual(['A-NO-POINT', 'A-POINT-NONE']);
    });

    it('falls back to the global default branch when neither is set', async () => {
        expect(await visibleFor('branch-default')).toEqual(['NONE-DEFAULT']);
    });

    it('hides a null-snapshot order of a foreign-branch counterparty', async () => {
        expect(await visibleFor('branch-a')).not.toContain('B-EXTERNAL');
        expect(await visibleFor('branch-b')).toEqual(['A-POINT-B', 'B-EXTERNAL']);
    });

    it('ignores the placement snapshot once the counterparty moves branch', async () => {
        await dataSource.query(`UPDATE counterparty SET "branchId" = 'branch-b' WHERE id = $1`, [
            Number(cps.a),
        ]);
        expect(await visibleFor('branch-b')).toEqual([
            'A-NO-POINT',
            'A-POINT-B',
            'A-POINT-NONE',
            'B-EXTERNAL',
        ]);
        expect(await visibleFor('branch-a')).toEqual([]);
    });

    it('own and granted managers still widen the branch', async () => {
        expect(await visibleFor('branch-a', { grantedManagerIds: ['m-b'] })).toEqual([
            'A-NO-POINT',
            'A-POINT-NONE',
            'B-EXTERNAL',
        ]);
        expect(await visibleFor('branch-a', { administratorId: 'm-none' })).toContain(
            'NONE-DEFAULT',
        );
    });
});
