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
let service: ApprovalRequestService;

const { schema, extra } = testSchemaOptions('approval_request_price_type_gate');

const steps = [
    {
        order: 1,
        role: 'GeneralDirector',
        requiredPermission: 'ApproveSecurityLimit',
        escalatesTo: [],
    },
];

function ctxFor(userId: string): RequestContext {
    return { activeUserId: userId, userHasPermissions: () => true } as unknown as RequestContext;
}

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
            { requestType: 'discountGrantApproval', displayName: 'Discount grant', steps },
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
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestApprovalRequest).clear();
});

function grantRequest(priceTypeCode: string | null): Promise<TestApprovalRequest> {
    return dataSource.getRepository(TestApprovalRequest).save({
        requestType: 'discountGrantApproval',
        payload: JSON.stringify(priceTypeCode ? { priceTypeCode, percent: 5 } : { percent: 5 }),
        requestedByAdministratorId: 'admin-1',
    });
}

describe('ApprovalRequest price type gate (integration, real Postgres)', () => {
    it('a role without access to the price type sees neither the request nor its payload', async () => {
        await grantRequest('type-a');
        const byType = await service.findByRequestType(ctxFor('admin-1'), 'discountGrantApproval', {
            allowedPriceTypeCodes: ['type-b'],
        });
        const inbox = await service.findAwaitingMyDecision(ctxFor('admin-1'), {
            allowedPriceTypeCodes: [],
        });
        const involved = await service.findAllInvolving(ctxFor('admin-1'), {
            allowedPriceTypeCodes: ['type-b'],
        });
        const summary = await service.getMySummary(ctxFor('admin-1'), 5, ['type-b']);
        expect(byType).toEqual({ items: [], totalItems: 0 });
        expect(inbox.totalItems).toBe(0);
        expect(involved.totalItems).toBe(0);
        expect(summary).toEqual({ pendingCount: 0, recent: [] });
    });

    it('a role with access sees the request with its payload', async () => {
        const req = await grantRequest('type-a');
        const opts = { allowedPriceTypeCodes: ['type-a'] };
        const byType = await service.findByRequestType(
            ctxFor('admin-1'),
            'discountGrantApproval',
            opts,
        );
        const inbox = await service.findAwaitingMyDecision(ctxFor('admin-1'), opts);
        const involved = await service.findAllInvolving(ctxFor('admin-1'), opts);
        const summary = await service.getMySummary(ctxFor('admin-1'), 5, ['type-a']);
        expect(byType.items.map(r => r.id)).toEqual([req.id]);
        expect(byType.items[0].payload).toContain('type-a');
        expect(inbox.totalItems).toBe(1);
        expect(involved.totalItems).toBe(1);
        expect(summary.pendingCount).toBe(1);
    });

    it('branch A and branch B each see only the requests of their own price types', async () => {
        const a = await grantRequest('type-a');
        const b = await grantRequest('type-b');
        const seen = async (codes: string[]): Promise<string[]> =>
            (
                await service.findByRequestType(ctxFor('admin-1'), 'discountGrantApproval', {
                    allowedPriceTypeCodes: codes,
                })
            ).items.map(r => String(r.id));
        expect(await seen(['type-a'])).toEqual([a.id]);
        expect(await seen(['type-b'])).toEqual([b.id]);
    });

    it('denies by default a gated request with no price type code in its payload', async () => {
        await grantRequest(null);
        const result = await service.findByRequestType(ctxFor('admin-1'), 'discountGrantApproval', {
            allowedPriceTypeCodes: ['type-a'],
        });
        expect(result.totalItems).toBe(0);
    });
});
