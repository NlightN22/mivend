import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';

import { ApprovalRequestService } from '../../approval-request.service';
import { WorkflowDefinitionService } from '../../workflow-definition.service';

// Same hand-rolled-schema pattern as approval-request.concurrency.test.ts — real Postgres, no
// mocking. findAwaitingMyDecision/findAllInvolving now build correlated-subquery SQL directly
// (see approval-request.service.ts, "Approvals inbox: real server-side pagination" in
// docs/ai/PROJECT_CONTEXT.md for why), which a mocked repository cannot meaningfully exercise —
// only a real query planner can catch a broken JOIN/subquery/parameter-name collision.
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
let service: ApprovalRequestService;

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

beforeAll(async () => {
    dataSource = new DataSource({
        type: 'postgres',
        host: process.env['TEST_DB_HOST'] ?? 'localhost',
        port: Number(process.env['TEST_DB_PORT'] ?? 5432),
        username: process.env['TEST_DB_USER'] ?? 'postgres',
        password: process.env['TEST_DB_PASSWORD'] ?? 'postgres',
        database: process.env['TEST_DB_NAME'] ?? 'mivend_test',
        entities: [TestApprovalRequest, TestApprovalStep],
        synchronize: true,
        dropSchema: true,
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

    service = new ApprovalRequestService(
        connectionShim,
        workflowDefinitionService,
        administratorService,
    );
});

afterAll(async () => {
    await dataSource.destroy();
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

describe('ApprovalRequestService pagination (integration, real Postgres)', () => {
    describe('findAwaitingMyDecision', () => {
        it('includes a pending request whose current-step permission the caller holds', async () => {
            const req = await createRequest();
            const result = await service.findAwaitingMyDecision(
                ctxWithPermissions(['ApproveDiscountRequest'], 'admin-1'),
            );
            expect(result.items.map(r => r.id)).toEqual([req.id]);
            expect(result.totalItems).toBe(1);
        });

        it('excludes a pending request the caller cannot decide (no permission, not escalated to them)', async () => {
            await createRequest();
            const result = await service.findAwaitingMyDecision(ctxWithPermissions([], 'admin-1'));
            expect(result.items).toEqual([]);
            expect(result.totalItems).toBe(0);
        });

        it('includes a request escalated to the caller even without the step permission', async () => {
            const req = await createRequest();
            await dataSource.getRepository(TestApprovalStep).save({
                approvalRequestId: req.id,
                stepIndex: 0,
                requiredRole: 'DepartmentHead',
                wasEscalated: true,
                escalatedToAdministratorId: 'admin-2',
            });
            const result = await service.findAwaitingMyDecision(ctxWithPermissions([], 'admin-2'));
            expect(result.items.map(r => r.id)).toEqual([req.id]);
        });

        it('paginates with take/skip and reports totalItems independent of the page size', async () => {
            const created = await Promise.all(Array.from({ length: 5 }, () => createRequest()));
            const page1 = await service.findAwaitingMyDecision(
                ctxWithPermissions(['ApproveDiscountRequest'], 'admin-1'),
                { take: 2, skip: 0 },
            );
            const page2 = await service.findAwaitingMyDecision(
                ctxWithPermissions(['ApproveDiscountRequest'], 'admin-1'),
                { take: 2, skip: 2 },
            );
            expect(page1.totalItems).toBe(5);
            expect(page2.totalItems).toBe(5);
            expect(page1.items).toHaveLength(2);
            expect(page2.items).toHaveLength(2);
            const page1Ids = page1.items.map(r => r.id);
            const page2Ids = page2.items.map(r => r.id);
            expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
            void created;
        });

        it('search filters by request id substring', async () => {
            const req = await createRequest();
            const matching = await service.findAwaitingMyDecision(
                ctxWithPermissions(['ApproveDiscountRequest'], 'admin-1'),
                { search: req.id.slice(0, 8) },
            );
            const nonMatching = await service.findAwaitingMyDecision(
                ctxWithPermissions(['ApproveDiscountRequest'], 'admin-1'),
                { search: 'zzz-does-not-exist' },
            );
            expect(matching.items.map(r => r.id)).toEqual([req.id]);
            expect(nonMatching.items).toEqual([]);
        });

        it('requestType filter narrows results to the given type only', async () => {
            const priceReq = await createRequest({ requestType: 'priceAdjustmentApproval' });
            await createRequest({ requestType: 'discountGrantApproval', currentStepIndex: 0 });
            const result = await service.findAwaitingMyDecision(
                ctxWithPermissions(['ApproveDiscountRequest', 'ApproveSecurityLimit'], 'admin-1'),
                { requestType: 'priceAdjustmentApproval' },
            );
            expect(result.items.map(r => r.id)).toEqual([priceReq.id]);
        });
    });

    describe('findAllInvolving', () => {
        it('returns an empty result when the caller has no Administrator record', async () => {
            const workflowDefinitionService = {
                getAllDefinitions: vi.fn(async () => []),
            } as unknown as WorkflowDefinitionService;
            const noAdminService = {
                findOneByUserId: vi.fn(async () => null),
            } as unknown as AdministratorService;
            const connectionShim = {
                getRepository: (_ctx: RequestContext, entity: { name: string }) =>
                    entity.name === 'ApprovalRequest'
                        ? dataSource.getRepository(TestApprovalRequest)
                        : dataSource.getRepository(TestApprovalStep),
            } as unknown as TransactionalConnection;
            const noAdminSvc = new ApprovalRequestService(
                connectionShim,
                workflowDefinitionService,
                noAdminService,
            );
            const result = await noAdminSvc.findAllInvolving(ctxWithPermissions([], 'ghost-user'));
            expect(result).toEqual({ items: [], totalItems: 0 });
        });

        it('unions submitted, decided-by-me, escalated-to-me (any step), and awaiting-decision requests without duplicates', async () => {
            const submitted = await createRequest({
                requestedByAdministratorId: 'admin-1',
                status: 'pending',
            });
            const decidedByMe = await createRequest({ status: 'approved', currentStepIndex: 1 });
            await dataSource.getRepository(TestApprovalStep).save({
                approvalRequestId: decidedByMe.id,
                stepIndex: 0,
                requiredRole: 'DepartmentHead',
                approverAdministratorId: 'admin-1',
                decision: 'approved',
            });
            // Escalated to me on step 0, but the request has since moved on to step 1 and is no
            // longer pending — must still show up (matches the old in-memory semantics exactly;
            // this is the case that a naive "current step only" rewrite would have silently
            // dropped).
            const escalatedToMePastStep = await createRequest({
                status: 'approved',
                currentStepIndex: 1,
            });
            await dataSource.getRepository(TestApprovalStep).save({
                approvalRequestId: escalatedToMePastStep.id,
                stepIndex: 0,
                requiredRole: 'DepartmentHead',
                wasEscalated: true,
                escalatedToAdministratorId: 'admin-1',
            });
            const awaitingMyDecision = await createRequest({
                status: 'pending',
                currentStepIndex: 0,
            });
            // Not involved AND not eligible to decide it either (step 0 of discountGrantApproval
            // requires ApproveSecurityLimit, which this caller doesn't hold) — must be excluded.
            // A pending request the caller CAN decide would correctly appear via the
            // awaiting-my-decision branch regardless of who submitted it — that's not a bug, see
            // findAwaitingMyDecision's own tests above for that exact case.
            await createRequest({
                requestType: 'discountGrantApproval',
                status: 'pending',
                currentStepIndex: 0,
                requestedByAdministratorId: 'admin-9',
            });

            const result = await service.findAllInvolving(
                ctxWithPermissions(['ApproveDiscountRequest'], 'admin-1'),
            );

            expect(result.items.map(r => r.id).sort()).toEqual(
                [
                    submitted.id,
                    decidedByMe.id,
                    escalatedToMePastStep.id,
                    awaitingMyDecision.id,
                ].sort(),
            );
            expect(result.totalItems).toBe(4);
        });

        it('paginates with take/skip', async () => {
            await Promise.all(
                Array.from({ length: 5 }, () =>
                    createRequest({ requestedByAdministratorId: 'admin-1' }),
                ),
            );
            const page = await service.findAllInvolving(
                ctxWithPermissions(['ApproveDiscountRequest'], 'admin-1'),
                { take: 2, skip: 0 },
            );
            expect(page.totalItems).toBe(5);
            expect(page.items).toHaveLength(2);
        });

        it('status filter narrows results within the involved set', async () => {
            const pending = await createRequest({
                requestedByAdministratorId: 'admin-1',
                status: 'pending',
            });
            await createRequest({ requestedByAdministratorId: 'admin-1', status: 'approved' });
            const result = await service.findAllInvolving(
                ctxWithPermissions(['ApproveDiscountRequest'], 'admin-1'),
                { status: 'pending' },
            );
            expect(result.items.map(r => r.id)).toEqual([pending.id]);
        });
    });

    describe('findByRequestType', () => {
        it('returns only requests of the given type, paginated, no scope/eligibility filtering', async () => {
            const rule1 = await createRequest({
                requestType: 'discountGrantApproval',
                currentStepIndex: 0,
            });
            const rule2 = await createRequest({
                requestType: 'discountGrantApproval',
                currentStepIndex: 0,
            });
            await createRequest({ requestType: 'priceAdjustmentApproval', currentStepIndex: 0 });

            const result = await service.findByRequestType(
                ctxWithPermissions([], 'admin-1'),
                'discountGrantApproval',
            );

            expect(result.totalItems).toBe(2);
            expect(result.items.map(r => r.id).sort()).toEqual([rule1.id, rule2.id].sort());
        });

        it('paginates with take/skip', async () => {
            await Promise.all(
                Array.from({ length: 5 }, () =>
                    createRequest({ requestType: 'discountGrantApproval' }),
                ),
            );
            const page = await service.findByRequestType(
                ctxWithPermissions([], 'admin-1'),
                'discountGrantApproval',
                { take: 2, skip: 0 },
            );
            expect(page.totalItems).toBe(5);
            expect(page.items).toHaveLength(2);
        });
    });
});
