import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, UserInputError } from '@vendure/core';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';

import { ApprovalRequestService } from '../../approval-request.service';
import { WorkflowDefinitionService } from '../../workflow-definition.service';

const steps = [
    {
        order: 1,
        role: 'SalesDeptHead',
        requiredPermission: 'ApproveDiscountRequest',
        escalatesTo: ['GeneralDirector'],
    },
    {
        order: 2,
        role: 'GeneralDirector',
        requiredPermission: 'ApproveDiscountRequest',
        escalatesTo: [],
    },
];

function mockCtx(hasPermission: boolean, activeUserId = 'user-1'): RequestContext {
    return {
        activeUserId,
        userHasPermissions: vi.fn(() => hasPermission),
    } as unknown as RequestContext;
}

describe('ApprovalRequestService', () => {
    let requestRepo: {
        findOneOrFail: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        createQueryBuilder: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
        find: ReturnType<typeof vi.fn>;
    };
    let stepRepo: {
        findOne: ReturnType<typeof vi.fn>;
        find: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
    };
    let adminRepo: { findOne: ReturnType<typeof vi.fn> };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let workflowDefinitionService: { getDefinition: ReturnType<typeof vi.fn> };
    let administratorService: {
        findOneByUserId: ReturnType<typeof vi.fn>;
    };
    let service: ApprovalRequestService;

    beforeEach(() => {
        const updateQueryBuilder = {
            update: vi.fn(() => updateQueryBuilder),
            set: vi.fn(() => updateQueryBuilder),
            where: vi.fn(() => updateQueryBuilder),
            execute: vi.fn(async () => ({ affected: 1 })),
        };
        requestRepo = {
            findOneOrFail: vi.fn(),
            save: vi.fn(async (x: unknown) => x),
            createQueryBuilder: vi.fn(() => updateQueryBuilder),
            count: vi.fn(async () => 0),
            find: vi.fn(async () => []),
        };
        stepRepo = {
            findOne: vi.fn(),
            find: vi.fn(async () => []),
            create: vi.fn((x: unknown) => x),
            save: vi.fn(async (x: unknown) => x),
        };
        adminRepo = { findOne: vi.fn() };
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name: string }) =>
                entity.name === 'ApprovalRequest'
                    ? requestRepo
                    : entity.name === 'Administrator'
                      ? adminRepo
                      : stepRepo,
            ),
        };
        workflowDefinitionService = {
            getDefinition: vi.fn(async () => ({
                requestType: 'priceAdjustmentApproval',
                displayName: 'Price adjustment',
                steps,
            })),
        };
        administratorService = { findOneByUserId: vi.fn() };
        service = new ApprovalRequestService(
            connection as unknown as TransactionalConnection,
            workflowDefinitionService as unknown as WorkflowDefinitionService,
            administratorService as unknown as AdministratorService,
        );
    });

    it('rejects a decide() call from a caller without the current step permission and no escalation', async () => {
        requestRepo.findOneOrFail.mockResolvedValue({
            id: 'req-1',
            status: 'pending',
            currentStepIndex: 0,
            requestType: 'priceAdjustmentApproval',
            xstateSnapshot: null,
        });
        stepRepo.findOne.mockResolvedValue(null);
        administratorService.findOneByUserId.mockResolvedValue({ id: 'admin-1' });

        await expect(service.decide(mockCtx(false), 'req-1', 'approved')).rejects.toThrow(
            ForbiddenError,
        );
        expect(requestRepo.save).not.toHaveBeenCalled();
    });

    it('allows decide() for a caller with the current step permission, advancing the step', async () => {
        const request = {
            id: 'req-1',
            status: 'pending',
            currentStepIndex: 0,
            requestType: 'priceAdjustmentApproval',
            xstateSnapshot: null,
        };
        requestRepo.findOneOrFail.mockResolvedValue(request);
        stepRepo.findOne.mockResolvedValue(null);
        administratorService.findOneByUserId.mockResolvedValue({ id: 'admin-1' });

        const result = await service.decide(mockCtx(true), 'req-1', 'approved');

        expect(result.status).toBe('pending');
        expect(result.currentStepIndex).toBe(1);
        expect(stepRepo.save).toHaveBeenCalled();
    });

    it('allows decide() via escalation even without the step permission, once escalatedTo matches the caller', async () => {
        requestRepo.findOneOrFail.mockResolvedValue({
            id: 'req-1',
            status: 'pending',
            currentStepIndex: 0,
            requestType: 'priceAdjustmentApproval',
            xstateSnapshot: null,
        });
        stepRepo.findOne.mockResolvedValue({
            wasEscalated: true,
            escalatedToAdministratorId: 'admin-2',
        });
        administratorService.findOneByUserId.mockResolvedValue({ id: 'admin-2' });

        const result = await service.decide(mockCtx(false), 'req-1', 'rejected');
        expect(result.status).toBe('rejected');
    });

    it('rejects decide() on an already-decided request instead of double-applying', async () => {
        requestRepo.findOneOrFail.mockResolvedValue({ id: 'req-1', status: 'approved' });
        await expect(service.decide(mockCtx(true), 'req-1', 'approved')).rejects.toThrow(
            UserInputError,
        );
        expect(requestRepo.save).not.toHaveBeenCalled();
    });

    it('rejects escalate() from anyone other than the request creator', async () => {
        requestRepo.findOneOrFail.mockResolvedValue({
            id: 'req-1',
            status: 'pending',
            requestedByAdministratorId: 'admin-1',
            currentStepIndex: 0,
            requestType: 'priceAdjustmentApproval',
        });
        administratorService.findOneByUserId.mockResolvedValue({ id: 'admin-2' });

        await expect(service.escalate(mockCtx(true), 'req-1', 'admin-3')).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('rejects escalate() to an administrator whose role is not in escalatesTo', async () => {
        requestRepo.findOneOrFail.mockResolvedValue({
            id: 'req-1',
            status: 'pending',
            requestedByAdministratorId: 'admin-1',
            currentStepIndex: 0,
            requestType: 'priceAdjustmentApproval',
        });
        administratorService.findOneByUserId.mockResolvedValue({ id: 'admin-1' });
        adminRepo.findOne.mockResolvedValue({
            user: { roles: [{ code: 'SomeOtherRole' }] },
        });

        await expect(service.escalate(mockCtx(true), 'req-1', 'admin-9')).rejects.toThrow(
            UserInputError,
        );
    });

    it('rejects escalate() to an administrator that is not a live administrator', async () => {
        requestRepo.findOneOrFail.mockResolvedValue({
            id: 'req-1',
            status: 'pending',
            requestedByAdministratorId: 'admin-1',
            currentStepIndex: 0,
            requestType: 'priceAdjustmentApproval',
        });
        administratorService.findOneByUserId.mockResolvedValue({ id: 'admin-1' });
        adminRepo.findOne.mockResolvedValue(null);

        await expect(service.escalate(mockCtx(true), 'req-1', 'admin-9')).rejects.toThrow(
            'Administrator not found',
        );
        expect(adminRepo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ relations: ['user', 'user.roles'] }),
        );
    });

    it('records escalation on the step row without transitioning the request state', async () => {
        const request = {
            id: 'req-1',
            status: 'pending',
            requestedByAdministratorId: 'admin-1',
            currentStepIndex: 0,
            requestType: 'priceAdjustmentApproval',
        };
        requestRepo.findOneOrFail.mockResolvedValue(request);
        administratorService.findOneByUserId.mockResolvedValue({ id: 'admin-1' });
        adminRepo.findOne.mockResolvedValue({
            user: { roles: [{ code: 'GeneralDirector' }] },
        });
        stepRepo.findOne.mockResolvedValue(null);

        const result = await service.escalate(mockCtx(true), 'req-1', 'admin-9');

        expect(result.status).toBe('pending');
        expect(result.currentStepIndex).toBe(0);
        expect(stepRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ wasEscalated: true, escalatedToAdministratorId: 'admin-9' }),
        );
    });

    it('getMySummary returns the pending count and recent requests for the caller only', async () => {
        administratorService.findOneByUserId.mockResolvedValue({ id: 'admin-1' });
        const qb = {
            where: vi.fn(() => qb),
            andWhere: vi.fn(() => qb),
            orderBy: vi.fn(() => qb),
            take: vi.fn(() => qb),
            getCount: vi.fn(async () => 2),
            getMany: vi.fn(async () => [{ id: 'req-1' }, { id: 'req-2' }]),
        };
        requestRepo.createQueryBuilder.mockReturnValue(qb as never);

        const result = await service.getMySummary(mockCtx(true), 5, ['code-a']);

        expect(qb.where).toHaveBeenCalledWith('request.requestedByAdministratorId = :adminId', {
            adminId: 'admin-1',
        });
        expect(qb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('priceTypeCode'),
            expect.objectContaining({ gateAllowedCodes: ['code-a'] }),
        );
        expect(qb.take).toHaveBeenCalledWith(5);
        expect(result).toEqual({ pendingCount: 2, recent: [{ id: 'req-1' }, { id: 'req-2' }] });
    });

    it('getMySummary returns an empty summary when the caller has no Administrator record', async () => {
        administratorService.findOneByUserId.mockResolvedValue(null);
        const result = await service.getMySummary(mockCtx(true), 5);
        expect(result).toEqual({ pendingCount: 0, recent: [] });
    });

    it('findPendingPriceAdjustmentOrderIds extracts dedup orderIds from pending requests only', async () => {
        requestRepo.find.mockResolvedValue([
            { id: 'req-1', payload: JSON.stringify({ orderId: 'order-1' }) },
            { id: 'req-2', payload: JSON.stringify({ orderId: 'order-2' }) },
            { id: 'req-3', payload: JSON.stringify({ orderId: 'order-1' }) },
        ]);

        const result = await service.findPendingPriceAdjustmentOrderIds(mockCtx(true));

        expect(requestRepo.find).toHaveBeenCalledWith({
            where: { requestType: 'priceAdjustmentApproval', status: 'pending' },
        });
        expect(result.sort()).toEqual(['order-1', 'order-2']);
    });

    it('findPendingPriceAdjustmentOrderIds skips rows with invalid JSON payload', async () => {
        requestRepo.find.mockResolvedValue([{ id: 'req-1', payload: 'not-json' }]);
        const result = await service.findPendingPriceAdjustmentOrderIds(mockCtx(true));
        expect(result).toEqual([]);
    });

    it('findPriceAdjustmentRequestsForOrder returns all statuses matching the given orderId', async () => {
        requestRepo.find.mockResolvedValue([
            { id: 'req-1', status: 'approved', payload: JSON.stringify({ orderId: 'order-1' }) },
            { id: 'req-2', status: 'pending', payload: JSON.stringify({ orderId: 'order-2' }) },
            { id: 'req-3', status: 'rejected', payload: JSON.stringify({ orderId: 'order-1' }) },
        ]);

        const result = await service.findPriceAdjustmentRequestsForOrder(mockCtx(true), 'order-1');

        expect(requestRepo.find).toHaveBeenCalledWith({
            where: { requestType: 'priceAdjustmentApproval' },
            order: { createdAt: 'DESC' },
        });
        expect(result.map(r => r.id)).toEqual(['req-1', 'req-3']);
    });

    it('findPriceAdjustmentRequestsForOrder skips rows with invalid JSON payload', async () => {
        requestRepo.find.mockResolvedValue([{ id: 'req-1', payload: 'not-json' }]);
        const result = await service.findPriceAdjustmentRequestsForOrder(mockCtx(true), 'order-1');
        expect(result).toEqual([]);
    });

    // Builds SQL via correlated subqueries; a mocked repository cannot exercise it meaningfully.
    // Real-Postgres coverage lives in __tests__/integration/approval-request.pagination.test.ts.

    // findByRequestType also moved to createQueryBuilder (paginated, see issue #39) — real
    // coverage in __tests__/integration/approval-request.pagination.test.ts.
});
