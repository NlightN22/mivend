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

import { ApprovalRequestService } from '../../approval-request.service';
import { WorkflowDefinitionService } from '../../workflow-definition.service';

// Promise.allSettled alone doesn't reliably overlap the reads on a fast local Postgres;
// the barrier holds each findOneOrFail until all N reads land, so writes race on the same version.
let readRaceBarrier: (() => Promise<void>) | null = null;

function armReadRaceBarrier(expectedArrivals: number): void {
    let arrived = 0;
    let release: () => void;
    const gate = new Promise<void>(resolve => {
        release = resolve;
    });
    readRaceBarrier = async () => {
        arrived += 1;
        if (arrived >= expectedArrivals) release();
        await gate;
    };
}

function disarmReadRaceBarrier(): void {
    readRaceBarrier = null;
}

// VendureEntity's primary column needs a bootstrap-time EntityIdStrategy, so tables are hand-rolled
// to match the production schema and run against real Postgres, not mocked.
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

const { schema, extra } = testSchemaOptions('approval_request_concurrency');

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
        getRepository: (_ctx: RequestContext, entity: { name: string }) => {
            const repo = dataSource.getRepository(entityMap[entity.name as keyof typeof entityMap]);
            // See `withReadRaceBarrier` below — only patches findOneOrFail when a barrier is
            // armed for the current test, a no-op otherwise.
            if (entity.name === 'ApprovalRequest' && readRaceBarrier) {
                const gate = readRaceBarrier;
                return new Proxy(repo, {
                    get(target, prop, receiver) {
                        if (prop === 'findOneOrFail') {
                            return async (...args: unknown[]) => {
                                const result = await (
                                    target.findOneOrFail as (...a: unknown[]) => Promise<unknown>
                                )(...args);
                                await gate();
                                return result;
                            };
                        }
                        return Reflect.get(target, prop, receiver);
                    },
                });
            }
            return repo;
        },
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

describe('ApprovalRequestService.decide (integration, real Postgres, concurrency)', () => {
    it('exactly one of two concurrent decide() calls on the same step succeeds', async () => {
        const request = await dataSource.getRepository(TestApprovalRequest).save({
            requestType: 'priceAdjustmentApproval',
            payload: '{}',
            status: 'pending',
            currentStepIndex: 0,
            xstateSnapshot: null,
        });

        armReadRaceBarrier(2);
        let results: PromiseSettledResult<unknown>[];
        try {
            results = await Promise.allSettled([
                service.decide(mockCtx, request.id, 'approved'),
                service.decide(mockCtx, request.id, 'approved'),
            ]);
        } finally {
            disarmReadRaceBarrier();
        }

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
