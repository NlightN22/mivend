import { companyWideRegistry } from './company-wide-registry';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ApprovalRequestQueryService } from '../../approval-request-query.service';
import { WorkflowDefinitionService } from '../../workflow-definition.service';

// Real Postgres, not mocked: a mocked repo can't catch broken JOIN/subquery/param-name collisions
@Entity('approval_request')
class TestApprovalRequest {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) requestType!: string;
    @Column({ type: 'text' }) payload!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'int', default: 0 }) currentStepIndex!: number;
    @Column({ type: 'varchar', nullable: true }) requestedByAdministratorId!: string | null;
    @Column({ type: 'text', nullable: true }) xstateSnapshot!: string | null;
    @Column({ type: 'timestamp', nullable: true }) decidedAt!: Date | null;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @VersionColumn() version!: number;
}

@Entity('approval_step')
@Index(['approvalRequestId', 'stepIndex'], { unique: true })
class TestApprovalStep {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) approvalRequestId!: string;
    @Column({ type: 'int' }) stepIndex!: number;
    @Column({ type: 'varchar' }) requiredRole!: string;
    @Column({ type: 'varchar', nullable: true }) approverAdministratorId!: string | null;
    @Column({ type: 'boolean', default: false }) wasEscalated!: boolean;
    @Column({ type: 'varchar', nullable: true }) escalatedByAdministratorId!: string | null;
    @Column({ type: 'varchar', nullable: true }) escalatedToAdministratorId!: string | null;
    @Column({ type: 'varchar', nullable: true }) decision!: string | null;
    @Column({ type: 'text', nullable: true }) comment!: string | null;
    @Column({ type: 'timestamp', nullable: true }) decidedAt!: Date | null;
}

let dataSource: DataSource;
let queryService: ApprovalRequestQueryService;

const priceAdjustmentSteps = [
    {
        order: 1,
        role: 'DepartmentHead',
        requiredPermission: 'ApproveDiscountRequest',
        escalatesTo: ['GeneralDirector'],
    },
    {
        order: 2,
        role: 'GeneralDirector',
        requiredPermission: 'ApproveSecurityLimit',
        escalatesTo: [],
    },
];
const discountSteps = [
    {
        order: 1,
        role: 'GeneralDirector',
        requiredPermission: 'ApproveSecurityLimit',
        escalatesTo: [],
    },
];

function ctxWithPermissions(permissions: string[], activeUserId = 'user-1'): RequestContext {
    return {
        activeUserId,
        userHasPermissions: (required: string[]) => required.every(p => permissions.includes(p)),
    } as unknown as RequestContext;
}

const { schema, extra } = testSchemaOptions('approval_request_list_filters');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestApprovalRequest, TestApprovalStep],
        synchronize: true,
    });
    await dataSource.initialize();

    const entityMap = { ApprovalRequest: TestApprovalRequest, ApprovalStep: TestApprovalStep };
    const connectionShim = {
        getRepository: (_ctx: RequestContext, entity: { name: string }) =>
            dataSource.getRepository(entityMap[entity.name as keyof typeof entityMap]),
    } as unknown as TransactionalConnection;

    const workflowDefinitionService = {
        getAllDefinitions: vi.fn(async () => [
            {
                requestType: 'priceAdjustmentApproval',
                displayName: 'Price adjustment',
                steps: priceAdjustmentSteps,
            },
            {
                requestType: 'discountGrantApproval',
                displayName: 'Discount grant',
                steps: discountSteps,
            },
        ]),
    } as unknown as WorkflowDefinitionService;

    const administratorService = {
        findOneByUserId: vi.fn(async (_ctx: RequestContext, userId: string) => ({ id: userId })),
    } as unknown as AdministratorService;

    queryService = new ApprovalRequestQueryService(
        connectionShim,
        workflowDefinitionService,
        administratorService,
        companyWideRegistry(connectionShim),
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestApprovalStep).clear();
    await dataSource.getRepository(TestApprovalRequest).clear();
});

async function createRequest(
    overrides: Partial<TestApprovalRequest> = {},
): Promise<TestApprovalRequest> {
    return dataSource.getRepository(TestApprovalRequest).save({
        requestType: 'priceAdjustmentApproval',
        payload: '{}',
        status: 'pending',
        currentStepIndex: 0,
        requestedByAdministratorId: null,
        xstateSnapshot: null,
        ...overrides,
    });
}

async function createDecided(
    overrides: Partial<TestApprovalRequest>,
): Promise<TestApprovalRequest> {
    const request = await createRequest({ decidedAt: new Date(), ...overrides });
    await dataSource.getRepository(TestApprovalStep).save({
        approvalRequestId: request.id,
        stepIndex: 0,
        requiredRole: 'DepartmentHead',
        approverAdministratorId: 'admin-1',
        decision: request.status,
    });
    return request;
}

const approver = ctxWithPermissions(['ApproveDiscountRequest', 'ApproveSecurityLimit'], 'admin-1');
const ids = (r: { items: { id: unknown }[] }): unknown[] => r.items.map(i => i.id);

describe('ApprovalRequestQueryService list filters and sort (integration, real Postgres)', () => {
    it('filters by type list, status, requester and creation window, counts following the filters', async () => {
        const a = await createRequest({ requestedByAdministratorId: 'admin-1' });
        const b = await createDecided({ requestType: 'discountGrantApproval', status: 'approved' });
        await createDecided({ createdAt: new Date('2020-01-01T00:00:00Z'), status: 'rejected' });

        const byType = await queryService.findAllInvolving(approver, {
            requestTypes: ['discountGrantApproval'],
        });
        expect(ids(byType)).toEqual([b.id]);
        expect(byType.totalItems).toBe(1);

        const mine = await queryService.findAllInvolving(approver, {
            requestedByAdministratorId: 'admin-1',
        });
        expect(ids(mine)).toEqual([a.id]);

        const recent = await queryService.findAllInvolving(approver, {
            createdFrom: new Date('2021-01-01T00:00:00Z'),
        });
        expect(recent.totalItems).toBe(2);
        const old = await queryService.findAllInvolving(approver, {
            createdTo: new Date('2021-01-01T00:00:00Z'),
            statuses: ['rejected'],
        });
        expect(old.totalItems).toBe(1);
    });

    it('sorts by a whitelisted column both ways and pages deterministically', async () => {
        const first = await createDecided({ status: 'approved' });
        const second = await createRequest({ status: 'pending' });
        const third = await createRequest({ status: 'pending' });
        const asc = await queryService.findAllInvolving(approver, {
            sortField: 'status',
            sortDir: 'ASC',
        });
        expect(ids(asc)[0]).toBe(first.id);
        const page1 = await queryService.findAllInvolving(approver, {
            sortField: 'id',
            sortDir: 'ASC',
            take: 2,
        });
        const page2 = await queryService.findAllInvolving(approver, {
            sortField: 'id',
            sortDir: 'ASC',
            take: 2,
            skip: 2,
        });
        const paged = [...ids(page1), ...ids(page2)];
        expect(new Set(paged).size).toBe(3);
        expect(paged).toEqual([first.id, second.id, third.id].map(String).sort());
    });

    it('puts undecided requests last when sorting by decision time in either direction', async () => {
        const decided = await createDecided({ status: 'approved' });
        const open = await createRequest();
        for (const sortDir of ['ASC', 'DESC']) {
            const r = await queryService.findAllInvolving(approver, {
                sortField: 'decidedAt',
                sortDir,
            });
            expect(ids(r)).toEqual([decided.id, open.id]);
        }
    });

    it('treats hostile search and sort input as plain data', async () => {
        await createRequest();
        const hostile = "x'; DROP TABLE approval_request; --";
        const result = await queryService.findAllInvolving(approver, {
            search: hostile,
            sortField: hostile,
            sortDir: hostile,
        });
        expect(result.totalItems).toBe(0);
        expect((await queryService.findAllInvolving(approver)).totalItems).toBe(1);
    });

    it('keeps the awaiting scope when filters are applied, and take 0 returns only the count', async () => {
        await createRequest();
        await createRequest({ requestType: 'discountGrantApproval' });
        const limited = ctxWithPermissions(['ApproveDiscountRequest'], 'admin-9');
        const awaiting = await queryService.findAwaitingMyDecision(limited, {
            requestTypes: ['priceAdjustmentApproval', 'discountGrantApproval'],
            take: 0,
        });
        expect(awaiting).toEqual({ items: [], totalItems: 1 });
    });
});
