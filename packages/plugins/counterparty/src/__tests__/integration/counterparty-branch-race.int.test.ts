import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import { Administrator } from '@vendure/core';
import {
    BranchAssignmentRetryEvent,
    BranchAssignmentService,
    Department,
    DepartmentBranchMapping,
    DepartmentBranchMappingService,
    Branch,
} from '@mivend/plugin-access-control';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';
import { Counterparty } from '../../entities/counterparty.entity';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpGroupLabel!: string | null;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'varchar', nullable: true }) managerErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchOverrideId!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

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
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
}

const { schema, extra } = testSchemaOptions('counterparty_branch_race');
const ctx = testRequestContext;
let dataSource: DataSource;
let service: CounterpartyService;
let assignment: BranchAssignmentService;
let mappings: DepartmentBranchMappingService;
const retries: BranchAssignmentRetryEvent[] = [];

function connection(): TransactionalConnection {
    const base = createTestConnection(dataSource);
    const mirrors = new Map<unknown, unknown>([
        [Counterparty, TestCounterparty],
        [Administrator, TestAdministrator],
        [Department, TestDepartment],
        [Branch, TestBranch],
        [DepartmentBranchMapping, TestMapping],
    ]);
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (mirrors.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            TestCounterparty,
            TestAdministrator,
            TestDepartment,
            TestBranch,
            TestMapping,
            TestErpUser,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const conn = connection();
    assignment = new BranchAssignmentService(conn, { instanceType: 'central' }, {
        publish: (event: BranchAssignmentRetryEvent) => {
            retries.push(event);
        },
    } as never);
    mappings = new DepartmentBranchMappingService(conn, assignment);
    service = new CounterpartyService(
        conn,
        {} as never,
        {} as never,
        {} as never,
        {
            publish: () => undefined,
        } as never,
    );
});

afterEach(async () => {
    for (const entity of [
        TestCounterparty,
        TestMapping,
        TestDepartment,
        TestBranch,
        TestAdministrator,
        TestErpUser,
    ]) {
        await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('applyActiveState vs reconcile (real Postgres)', () => {
    it('a stream update never writes a stale branchId over a concurrent mapping reconcile', async () => {
        const branches = dataSource.getRepository(TestBranch);
        const first = (await branches.save({ erpId: 'branch-a', name: 'A' })).id;
        const second = (await branches.save({ erpId: 'branch-b', name: 'B' })).id;
        await dataSource
            .getRepository(TestDepartment)
            .save({ erpId: 'dept-1', name: 'Dept 1', parentErpId: null });
        await dataSource
            .getRepository(TestCounterparty)
            .save({ erpId: 'cp-1', legalName: 'N', shortName: 'N', departmentId: 'dept-1' });
        await mappings.set(ctx, 'dept-1', String(first));

        for (let round = 0; round < 8; round++) {
            const target = round % 2 === 0 ? second : first;
            await Promise.all([
                assignment.assignCounterpartyIfInputsChanged(ctx, 'cp-1', () =>
                    service.upsertActiveState(ctx, 'cp-1', {
                        name: `Name ${round}`,
                        isActive: true,
                        departmentId: 'dept-1',
                    }),
                ),
                mappings.set(ctx, 'dept-1', String(target)),
            ]);
            // Stands in for the post-commit listener: rows skipped under a lock are retried.
            while (retries.length > 0) {
                const event = retries.shift() as BranchAssignmentRetryEvent;
                await assignment.retrySkipped(ctx, event.skipped, event.attempt);
            }
            const row = await dataSource
                .getRepository(TestCounterparty)
                .findOneByOrFail({ erpId: 'cp-1' });
            expect(row.branchId).toBe(String(target));
            expect(row.legalName).toBe(`Name ${round}`);
        }
    });
});
