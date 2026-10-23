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
import { ApprovalScopeRegistry, payloadField } from '../../approval-scope.registry';
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
let visibleOrders: string[] | null = null;

const { schema, extra } = testSchemaOptions('approval_request_order_scope');

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
            { requestType: 'priceAdjustmentApproval', displayName: 'Price adjustment', steps },
        ]),
    } as unknown as WorkflowDefinitionService;
    const administratorService = {
        findOneByUserId: vi.fn(async (_ctx: RequestContext, userId: string) => ({ id: userId })),
    } as unknown as AdministratorService;
    const registry = new ApprovalScopeRegistry(connectionShim);
    // Stands in for the order plugin's rule: the caller sees only the orders in `visibleOrders`.
    registry.register('priceAdjustmentApproval', async () =>
        visibleOrders === null
            ? null
            : {
                  sql: `${payloadField('orderId')} IN (:...visible)`,
                  params: { visible: visibleOrders.length ? visibleOrders : [''] },
              },
    );
    queryService = new ApprovalRequestQueryService(
        connectionShim,
        workflowDefinitionService,
        administratorService,
        registry,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    visibleOrders = null;
    await dataSource.getRepository(TestApprovalRequest).clear();
});

function adjustment(orderId: string | null, status = 'pending'): Promise<TestApprovalRequest> {
    return dataSource.getRepository(TestApprovalRequest).save({
        requestType: 'priceAdjustmentApproval',
        payload: orderId === null ? 'not-json' : JSON.stringify({ orderId, requestedPrice: 1 }),
        status,
        requestedByAdministratorId: 'admin-1',
    });
}

describe('ApprovalRequest order scope (integration, real Postgres)', () => {
    it('pending order ids are deduplicated, pending only, and skip an unparsable payload', async () => {
        await adjustment('order-1');
        await adjustment('order-2');
        await adjustment('order-1');
        await adjustment('order-3', 'approved');
        await adjustment(null);
        const ids = await queryService.findPendingPriceAdjustmentOrderIds(ctxFor('admin-1'));
        expect(ids.sort()).toEqual(['order-1', 'order-2']);
    });

    it("an order's requests list every status and skip an unparsable payload", async () => {
        const approved = await adjustment('order-1', 'approved');
        await adjustment('order-2');
        const rejected = await adjustment('order-1', 'rejected');
        await adjustment(null);
        const rows = await queryService.findPriceAdjustmentRequestsForOrder(
            ctxFor('admin-1'),
            'order-1',
        );
        expect(rows.map(r => r.id).sort()).toEqual([approved.id, rejected.id].sort());
    });

    it('every read drops the requests of orders outside the scope, counts included', async () => {
        const own = await adjustment('order-1');
        await adjustment('order-2');
        visibleOrders = ['order-1'];
        const ctx = ctxFor('admin-1');
        expect(await queryService.findPendingPriceAdjustmentOrderIds(ctx)).toEqual(['order-1']);
        expect(await queryService.findPriceAdjustmentRequestsForOrder(ctx, 'order-2')).toEqual([]);
        const inbox = await queryService.findAwaitingMyDecision(ctx);
        expect(inbox.items.map(r => r.id)).toEqual([own.id]);
        expect(inbox.totalItems).toBe(1);
        const involved = await queryService.findAllInvolving(ctx);
        expect(involved.totalItems).toBe(1);
        const summary = await queryService.getMySummary(ctx, 5);
        expect(summary.pendingCount).toBe(1);
        visibleOrders = [];
        expect((await queryService.findAwaitingMyDecision(ctx)).totalItems).toBe(0);
    });
});
