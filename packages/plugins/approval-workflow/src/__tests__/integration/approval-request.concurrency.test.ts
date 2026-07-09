import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';

import { ApprovalRequestService } from '../../approval-request.service';
import { WorkflowDefinitionService } from '../../workflow-definition.service';

// Same constraint as documents/sync's integration tests (VendureEntity needs a bootstrap-time
// EntityIdStrategy for its primary column) — hand-rolled tables matching production schema,
// against real Postgres, no DB mocking.
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
const mockCtx = {
    activeUserId: 'user-1',
    userHasPermissions: () => true,
} as unknown as RequestContext;

const steps = [
    {
        order: 1,
        role: 'SalesDeptHead',
        requiredPermission: 'ApproveDiscountRequest',
        escalatesTo: [],
    },
    {
        order: 2,
        role: 'GeneralDirector',
        requiredPermission: 'ApproveDiscountRequest',
        escalatesTo: [],
    },
];

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
        getDefinition: vi.fn(async () => ({
            requestType: 'priceAdjustmentApproval',
            displayName: 'Price adjustment',
            steps,
        })),
    } as unknown as WorkflowDefinitionService;

    const administratorService = {
        findOneByUserId: vi.fn(async () => ({ id: 'admin-1' })),
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

describe('ApprovalRequestService.decide (integration, real Postgres, concurrency)', () => {
    it('exactly one of two concurrent decide() calls on the same step succeeds', async () => {
        const request = await dataSource.getRepository(TestApprovalRequest).save({
            requestType: 'priceAdjustmentApproval',
            payload: '{}',
            status: 'pending',
            currentStepIndex: 0,
            xstateSnapshot: null,
        });

        const results = await Promise.allSettled([
            service.decide(mockCtx, request.id, 'approved'),
            service.decide(mockCtx, request.id, 'approved'),
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const final = await dataSource.getRepository(TestApprovalRequest).findOneOrFail({
            where: { id: request.id },
        });
        // Advanced exactly once, not twice — a double-apply would leave currentStepIndex at 2.
        expect(final.currentStepIndex).toBe(1);
    });

    it('rehydrate correctness: a snapshot persisted by one call resumes correctly on the next', async () => {
        const request = await dataSource.getRepository(TestApprovalRequest).save({
            requestType: 'priceAdjustmentApproval',
            payload: '{}',
            status: 'pending',
            currentStepIndex: 0,
            xstateSnapshot: null,
        });

        await service.decide(mockCtx, request.id, 'approved');
        const afterFirst = await dataSource.getRepository(TestApprovalRequest).findOneOrFail({
            where: { id: request.id },
        });
        expect(afterFirst.currentStepIndex).toBe(1);
        expect(afterFirst.status).toBe('pending');

        const final = await service.decide(mockCtx, request.id, 'approved');
        expect(final.status).toBe('approved');
    });
});
