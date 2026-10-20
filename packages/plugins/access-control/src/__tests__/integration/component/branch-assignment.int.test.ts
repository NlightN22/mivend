import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { Administrator } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import type { BranchAssignmentRetryEvent } from '../../../branch-assignment-retry.event';
import { BranchAssignmentService } from '../../../branch-assignment.service';
import { DepartmentBranchMappingService } from '../../../department-branch-mapping.service';
import { DepartmentService } from '../../../department.service';
import { Branch } from '../../../entities/branch.entity';
import { DepartmentBranchMapping } from '../../../entities/department-branch-mapping.entity';
import { Department } from '../../../entities/department.entity';

class TestAdminCustomFields {
    @Column({ name: 'customFieldsDepartmentid', type: 'varchar', nullable: true })
    departmentId!: string | null;

    @Column({ name: 'customFieldsBranchid', type: 'varchar', nullable: true })
    branchId!: string | null;
}

@Entity('administrator')
class TestAdministrator {
    @PrimaryGeneratedColumn() id!: number;
    @DeleteDateColumn({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
    @Column(() => TestAdminCustomFields, { prefix: false }) customFields!: TestAdminCustomFields;
}

@Entity('department')
class TestDepartment {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar', nullable: true }) parentErpId!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

@Entity('branch')
class TestBranch {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar' }) name!: string;
}

@Entity('department_branch_mapping')
class TestMapping {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) departmentErpId!: string;
    @Column({ type: 'int' }) branchId!: number;
    @ManyToOne(() => TestBranch, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'branchId' })
    branch?: TestBranch;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
}

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'varchar', nullable: true }) managerErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchOverrideId!: string | null;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

const { schema, extra } = testSchemaOptions('access_control_branch_assignment');
const ctx = testRequestContext as RequestContext;
let dataSource: DataSource;
let assignment: BranchAssignmentService;
let mappings: DepartmentBranchMappingService;
let departments: DepartmentService;
const events: BranchAssignmentRetryEvent[] = [];
const eventBus = {
    publish: (event: BranchAssignmentRetryEvent) => {
        events.push(event);
    },
} as unknown as EventBus;
let branchA: number;
let branchB: number;

function makeConnection(): TransactionalConnection {
    const base = createTestConnection(dataSource);
    const testEntities = new Map<unknown, unknown>([
        [Administrator, TestAdministrator],
        [Department, TestDepartment],
        [Branch, TestBranch],
        [DepartmentBranchMapping, TestMapping],
    ]);
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: { em?: DataSource['manager'] }, entity: unknown) => {
            const test = testEntities.get(entity);
            if (!test) return base.getRepository(c as RequestContext, entity as never);
            return (c.em ?? dataSource.manager).getRepository(test as never);
        },
    } as unknown as TransactionalConnection;
}

async function admin(departmentId: string | null): Promise<number> {
    const saved = await dataSource
        .getRepository(TestAdministrator)
        .save({ customFields: { departmentId, branchId: null } });
    return saved.id;
}

async function adminBranch(id: number): Promise<string | null> {
    const row = await dataSource.getRepository(TestAdministrator).findOneByOrFail({ id });
    return row.customFields.branchId;
}

async function counterparty(fields: Partial<TestCounterparty>): Promise<number> {
    const saved = await dataSource
        .getRepository(TestCounterparty)
        .save({ erpId: `cp-${Math.random()}`, ...fields });
    return saved.id;
}

async function counterpartyRow(id: number): Promise<TestCounterparty> {
    return dataSource.getRepository(TestCounterparty).findOneByOrFail({ id });
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            TestAdministrator,
            TestDepartment,
            TestBranch,
            TestMapping,
            TestErpUser,
            TestCounterparty,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = makeConnection();
    assignment = new BranchAssignmentService(connection, { instanceType: 'central' }, eventBus);
    mappings = new DepartmentBranchMappingService(connection, assignment);
    departments = new DepartmentService(connection, assignment);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    events.length = 0;
    const branches = dataSource.getRepository(TestBranch);
    branchA = (await branches.save({ erpId: 'branch-a', name: 'Branch A' })).id;
    branchB = (await branches.save({ erpId: 'branch-b', name: 'Branch B' })).id;
    const tree = dataSource.getRepository(TestDepartment);
    await tree.save([
        { erpId: 'root', name: 'Root', parentErpId: null },
        { erpId: 'dept-1', name: 'Department 1', parentErpId: 'root' },
        { erpId: 'dept-1a', name: 'Department 1a', parentErpId: 'dept-1' },
        { erpId: 'dept-2', name: 'Department 2', parentErpId: 'root' },
    ]);
});

afterEach(async () => {
    for (const entity of [
        TestCounterparty,
        TestErpUser,
        TestAdministrator,
        TestMapping,
        TestDepartment,
        TestBranch,
    ]) {
        await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
});

describe('BranchAssignmentService (real DB)', () => {
    it('user event: assigns the inherited branch, and null for an unmapped department', async () => {
        await mappings.set(ctx, 'dept-1', String(branchA));
        const inherited = await admin('dept-1a');
        const unmapped = await admin('dept-2');
        await assignment.assignAdministrator(ctx, inherited);
        await assignment.assignAdministrator(ctx, unmapped);
        expect(await adminBranch(inherited)).toBe(String(branchA));
        expect(await adminBranch(unmapped)).toBeNull();
        expect(await assignment.resolveBranchId(ctx, 'dept-2')).toBeNull();
    });

    it('mapping change propagates to the subtree only, and clearing it removes the branch', async () => {
        const inSubtree = await admin('dept-1a');
        const outside = await admin('dept-2');
        const counterpartyId = await counterparty({ departmentId: 'dept-1a' });
        await mappings.set(ctx, 'dept-1', String(branchA));
        expect(await adminBranch(inSubtree)).toBe(String(branchA));
        expect(await adminBranch(outside)).toBeNull();
        expect((await counterpartyRow(counterpartyId)).branchId).toBe(String(branchA));

        await mappings.set(ctx, 'dept-1', String(branchB));
        expect(await adminBranch(inSubtree)).toBe(String(branchB));

        await mappings.clear(ctx, 'dept-1');
        expect(await adminBranch(inSubtree)).toBeNull();
        expect((await counterpartyRow(counterpartyId)).branchId).toBeNull();
    });

    it('counterparty: manager department beats the own one; override survives and clearing re-runs the rule', async () => {
        await mappings.set(ctx, 'dept-1', String(branchA));
        await mappings.set(ctx, 'dept-2', String(branchB));
        await dataSource
            .getRepository(TestErpUser)
            .save({ erpId: 'user-1', departmentId: 'dept-1' });
        const id = await counterparty({ managerErpId: 'user-1', departmentId: 'dept-2' });
        await assignment.assignCounterparties(ctx, { erpId: (await counterpartyRow(id)).erpId });
        expect((await counterpartyRow(id)).branchId).toBe(String(branchA));

        await mappings.setCounterpartyOverride(ctx, String(id), String(branchB));
        await mappings.set(ctx, 'dept-1', String(branchA));
        await assignment.reconcileAll(ctx);
        expect((await counterpartyRow(id)).branchId).toBe(String(branchB));

        await mappings.setCounterpartyOverride(ctx, String(id), null);
        expect((await counterpartyRow(id)).branchId).toBe(String(branchA));
    });

    it('is idempotent: a repeated reconcile changes nothing', async () => {
        await mappings.set(ctx, 'dept-1', String(branchA));
        const id = await counterparty({ departmentId: 'dept-1' });
        await assignment.reconcileAll(ctx);
        const before = await counterpartyRow(id);
        await assignment.reconcileAll(ctx);
        await assignment.reconcileAll(ctx);
        expect((await counterpartyRow(id)).updatedAt).toEqual(before.updatedAt);
    });

    it('reparenting a department moves its subtree to the new ancestor branch', async () => {
        await mappings.set(ctx, 'dept-1', String(branchA));
        await mappings.set(ctx, 'dept-2', String(branchB));
        const id = await admin('dept-1a');
        await assignment.assignAdministrator(ctx, id);
        await departments.upsert(ctx, {
            erpId: 'dept-1a',
            name: 'Department 1a',
            parentErpId: 'dept-2',
        });
        expect(await adminBranch(id)).toBe(String(branchB));
    });

    it('a replica never writes', async () => {
        const replica = new BranchAssignmentService(
            makeConnection(),
            { instanceType: 'branch' },
            eventBus,
        );
        await mappings.set(ctx, 'dept-1', String(branchA));
        const id = await admin('dept-1');
        await assignment.reconcileAll(ctx);
        expect(await adminBranch(id)).toBe(String(branchA));
        await dataSource.query(
            `UPDATE "${schema}".administrator SET "customFieldsBranchid" = NULL WHERE id = $1`,
            [id],
        );
        await replica.assignAdministrator(ctx, id);
        expect(await adminBranch(id)).toBeNull();
    });

    it('concurrent writers: user event racing a mapping edit ends consistent with the final mapping', async () => {
        const id = await admin('dept-1a');
        for (let round = 0; round < 8; round++) {
            const target = round % 2 === 0 ? branchA : branchB;
            await Promise.all([
                mappings.set(ctx, 'dept-1', String(target)),
                assignment.assignAdministrator(ctx, id),
                assignment.assignAdministrator(ctx, id),
            ]);
            expect(await adminBranch(id)).toBe(String(target));
        }
    });
});

describe('BranchAssignmentService hardening (real DB)', () => {
    it('counterparty event (row write then assign) racing reconcileAll and a mapping edit: no deadlock, final state matches the mapping', async () => {
        const id = await counterparty({ departmentId: 'dept-1a' });
        const erpId = (await counterpartyRow(id)).erpId;
        for (let round = 0; round < 8; round++) {
            const target = round % 2 === 0 ? branchA : branchB;
            await Promise.all([
                dataSource.transaction(async em => {
                    await em.query(
                        `UPDATE "${schema}".counterparty SET "departmentId" = 'dept-1a' WHERE id = $1`,
                        [id],
                    );
                    await assignment.assignCounterparties({ em } as unknown as RequestContext, {
                        erpId,
                    });
                }),
                assignment.reconcileAll(ctx),
                mappings.set(ctx, 'dept-1', String(target)),
            ]);
            expect((await counterpartyRow(id)).branchId).toBe(String(target));
        }
    });

    it('a full reconcile batches by id: every row beyond one batch is assigned', async () => {
        await dataSource.query(
            `INSERT INTO "${schema}".counterparty ("erpId", "departmentId")
             SELECT 'bulk-' || g, 'dept-1' FROM generate_series(1, 1100) g`,
        );
        await mappings.set(ctx, 'dept-1', String(branchA));
        const unassigned = await dataSource
            .getRepository(TestCounterparty)
            .createQueryBuilder('c')
            .where('c.branchId IS NULL')
            .getCount();
        expect(unassigned).toBe(0);
    });

    it('terminates and inherits across a cycle in the parent chain', async () => {
        await dataSource.getRepository(TestDepartment).save([
            { erpId: 'cyc-a', name: 'Cycle A', parentErpId: 'cyc-b' },
            { erpId: 'cyc-b', name: 'Cycle B', parentErpId: 'cyc-a' },
        ]);
        const id = await admin('cyc-b');
        await mappings.set(ctx, 'cyc-a', String(branchA));
        expect(await adminBranch(id)).toBe(String(branchA));
        await mappings.clear(ctx, 'cyc-a');
        expect(await adminBranch(id)).toBeNull();
    });

    it('a branch referenced by a mapping cannot be deleted', async () => {
        await mappings.set(ctx, 'dept-1', String(branchA));
        await expect(dataSource.getRepository(TestBranch).delete({ id: branchA })).rejects.toThrow(
            /foreign key|violates/i,
        );
    });

    it('a replica rejects set and clear', async () => {
        const replica = new BranchAssignmentService(
            makeConnection(),
            { instanceType: 'branch' },
            eventBus,
        );
        const replicaMappings = new DepartmentBranchMappingService(makeConnection(), replica);
        await expect(replicaMappings.set(ctx, 'dept-1', String(branchA))).rejects.toThrow(
            /central/,
        );
        await expect(replicaMappings.clear(ctx, 'dept-1')).rejects.toThrow(/central/);
    });
});

describe('rows locked during a mapping edit are retried after release (real DB)', () => {
    it('a counterparty and an administrator held by an open transaction are reconciled by the retry, not the backstop', async () => {
        const counterpartyId = await counterparty({ departmentId: 'dept-1' });
        const adminId = await admin('dept-1');
        let release: () => void = () => undefined;
        const held = new Promise<void>(resolve => (release = resolve));
        let locked: () => void = () => undefined;
        const lockedSignal = new Promise<void>(resolve => (locked = resolve));
        const holder = dataSource.transaction(async em => {
            await em.query(`SELECT 1 FROM "${schema}".counterparty WHERE id = $1 FOR UPDATE`, [
                counterpartyId,
            ]);
            await em.query(`SELECT 1 FROM "${schema}".administrator WHERE id = $1 FOR UPDATE`, [
                adminId,
            ]);
            locked();
            await held;
        });
        await lockedSignal;

        await mappings.set(ctx, 'dept-1', String(branchA));
        expect((await counterpartyRow(counterpartyId)).branchId).toBeNull();
        expect(await adminBranch(adminId)).toBeNull();
        expect(events).toHaveLength(1);

        release();
        await holder;
        await assignment.retrySkipped(ctx, events[0].skipped, events[0].attempt);

        expect((await counterpartyRow(counterpartyId)).branchId).toBe(String(branchA));
        expect(await adminBranch(adminId)).toBe(String(branchA));
    });

    it('gives up after the attempt limit instead of publishing forever', async () => {
        const counterpartyId = await counterparty({ departmentId: 'dept-1' });
        await mappings.set(ctx, 'dept-1', String(branchA));
        await dataSource.query(
            `UPDATE "${schema}".counterparty SET "branchId" = NULL WHERE id = $1`,
            [counterpartyId],
        );
        let release: () => void = () => undefined;
        const held = new Promise<void>(resolve => (release = resolve));
        let locked: () => void = () => undefined;
        const lockedSignal = new Promise<void>(resolve => (locked = resolve));
        const holder = dataSource.transaction(async em => {
            await em.query(`SELECT 1 FROM "${schema}".counterparty WHERE id = $1 FOR UPDATE`, [
                counterpartyId,
            ]);
            locked();
            await held;
        });
        await lockedSignal;
        await assignment.retrySkipped(
            ctx,
            { administratorIds: [], counterpartyIds: [String(counterpartyId)] },
            5,
        );
        expect(events).toHaveLength(0);
        release();
        await holder;
    });
});
