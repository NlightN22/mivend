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
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

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
    @Column({ name: 'customFieldsIsexternal', type: 'boolean', default: false })
    isExternal!: boolean;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
    @Column({ name: 'customFieldsBranchid', type: 'varchar', nullable: true })
    branchId!: string | null;
    @Column({ type: 'int', nullable: true }) customerId!: number | null;
    @ManyToOne(() => TestCustomer, { createForeignKeyConstraints: false })
    @JoinColumn({ name: 'customerId' })
    customer!: TestCustomer | null;
}

// The real Counterparty class cannot be registered without Vendure bootstrap; an EntitySchema
// targeting it lets the service's own leftJoin(Counterparty, ...) run unchanged.
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

const { schema, extra } = testSchemaOptions('external_order_visibility');
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
        entities: [TestOrder, TestCustomer, counterpartySchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE counterparty_team_member ("counterpartyId" varchar, "administratorId" varchar)`,
    );
    const listQueryBuilder = {
        build: () => dataSource.getRepository(TestOrder).createQueryBuilder('order'),
    };
    const realScope = new AccessScopeService({} as never, {} as never, {} as never);
    const accessScope = {
        resolveOrderScope: async () => scope,
        applyOwnCounterpartyFilter: realScope.applyOwnCounterpartyFilter.bind(realScope),
        managerClause: realScope.managerClause.bind(realScope),
    };
    service = new OrderVisibilityService(
        listQueryBuilder as unknown as ListQueryBuilder,
        accessScope as unknown as AccessScopeService,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

let withBranch: string;
let withoutBranch: string;

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE "order", customer, counterparty, counterparty_team_member RESTART IDENTITY CASCADE',
    );
    const insert = async (
        erpId: string,
        manager: string,
        branch: string | null,
    ): Promise<string> => {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "assignedManagerId", "branchId")
             VALUES ($1, $2, $3) RETURNING id`,
            [erpId, manager, branch],
        );
        return String(row.id);
    };
    withBranch = await insert('cp-a', 'admin-1', 'branch-a');
    withoutBranch = await insert('cp-b', 'admin-2', null);
    await dataSource.getRepository(TestOrder).save([
        { code: 'EXT-A', isExternal: true, counterpartyId: withBranch, branchId: 'branch-a' },
        { code: 'EXT-B', isExternal: true, counterpartyId: withoutBranch, branchId: null },
    ]);
});

const visibleCodes = async (): Promise<string[]> => {
    const result = await service.findVisible(ctx);
    return result.items.map(o => o.code).sort();
};

describe('external orders in the manager order list (real Postgres)', () => {
    it('shows the order of a counterparty with a branch only to that branch', async () => {
        scope = { kind: 'department', departmentId: 'dept-1', branchId: 'branch-a' };
        expect(await visibleCodes()).toContain('EXT-A');

        scope = { kind: 'department', departmentId: 'dept-1', branchId: 'branch-b' };
        const foreign = await visibleCodes();
        expect(foreign).not.toContain('EXT-A');
    });

    it('shows the order of a counterparty without a branch to its manager, not to another', async () => {
        scope = { kind: 'own', administratorId: 'admin-2' };
        expect(await visibleCodes()).toEqual(['EXT-B']);

        scope = { kind: 'own', administratorId: 'admin-3' };
        expect(await visibleCodes()).toEqual([]);
    });

    it('lists every external order for the all scope', async () => {
        scope = { kind: 'all' };
        expect(await visibleCodes()).toEqual(['EXT-A', 'EXT-B']);
    });

    it('a branch-less external order follows the documented branch-less carve-out (#123)', async () => {
        scope = { kind: 'department', departmentId: 'dept-1', branchId: 'branch-b' };
        expect(await visibleCodes()).toEqual(['EXT-B']);
    });
});
