import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationReconciliationIssueService } from '../../reservation-reconciliation-issue.service';

describe('ReservationReconciliationIssueService', () => {
    let repo: {
        findOne: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        // Only assigned by the nested 'findOpen scope filtering' describe block below — optional
        // here so that assignment doesn't need a `tsc -b`-unfriendly cast (issue #115).
        createQueryBuilder?: ReturnType<typeof vi.fn>;
    };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let notificationService: { create: ReturnType<typeof vi.fn> };
    let service: ReservationReconciliationIssueService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = {
            findOne: vi.fn(async () => null),
            create: vi.fn((fields: unknown) => fields),
            save: vi.fn(async (row: unknown) => row),
        };
        connection = { getRepository: vi.fn(() => repo) };
        notificationService = { create: vi.fn(async () => ({})) };
        service = new ReservationReconciliationIssueService(
            connection as unknown as TransactionalConnection,
            notificationService as never,
            { resolveOrderScope: vi.fn(async () => ({ kind: 'all' })) } as never,
            { getGlobalDefaultBranchId: vi.fn(async () => null) } as never,
        );
    });

    // Handler is not atomic: a retry after partial failure re-runs it, so report() must not insert
    // a second row for the same still-open drift.
    it('reportQuantityMismatch returns the existing open issue instead of inserting a duplicate', async () => {
        const existing = { id: 'issue-1' };
        repo.findOne.mockResolvedValue(existing);

        const result = await service.reportQuantityMismatch(ctx, {
            orderId: 'order-1',
            productVariantId: 'v-1',
            localQuantity: 5,
            erpQuantity: 3,
            orderEntityId: 'erp-order-1',
        });

        expect(result).toBe(existing);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('reportQuantityMismatch creates a new row when no open issue matches', async () => {
        await service.reportQuantityMismatch(ctx, {
            orderId: 'order-1',
            productVariantId: 'v-1',
            localQuantity: 5,
            erpQuantity: 3,
            orderEntityId: 'erp-order-1',
        });

        expect(repo.save).toHaveBeenCalledTimes(1);
        expect(repo.save.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                issueType: 'QUANTITY_MISMATCH',
                orderId: 'order-1',
                productVariantId: 'v-1',
                status: 'open',
            }),
        );
    });

    // Runs from an inbox handler with no signed-in admin, so it broadcasts to all admins.
    it('creates an administrator-broadcast Notification when a new issue is recorded (no signed-in administrator)', async () => {
        await service.reportQuantityMismatch(ctx, {
            orderId: 'order-1',
            productVariantId: 'v-1',
            localQuantity: 5,
            erpQuantity: 3,
            orderEntityId: 'erp-order-1',
        });

        expect(notificationService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                recipientType: 'administrator-broadcast',
                kind: 'warning',
                sourceType: 'reservation-reconciliation',
            }),
        );
    });

    it('does not create a Notification when reporting an already-open issue (dedupe path)', async () => {
        repo.findOne.mockResolvedValue({ id: 'issue-1' });

        await service.reportQuantityMismatch(ctx, {
            orderId: 'order-1',
            productVariantId: 'v-1',
            localQuantity: 5,
            erpQuantity: 3,
            orderEntityId: 'erp-order-1',
        });

        expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('reportUnresolvedProductMapping dedupes on externalProductId, not productVariantId', async () => {
        const existing = { id: 'issue-2' };
        repo.findOne.mockResolvedValue(existing);

        const result = await service.reportUnresolvedProductMapping(ctx, {
            orderId: 'order-1',
            externalProductId: 'unknown-prod-1',
            orderEntityId: 'erp-order-1',
        });

        expect(result).toBe(existing);
        expect(repo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    issueType: 'UNRESOLVED_PRODUCT_MAPPING',
                    externalProductId: 'unknown-prod-1',
                }),
            }),
        );
        expect(repo.save).not.toHaveBeenCalled();
    });

    // findOpen must be scoped by branch and counterparty; unscoped, branch managers see company-wide issues.
    // The mock query builder must mirror the real order/customer/counterparty join shape.
    describe('findOpen scope filtering', () => {
        function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
            const qb: Record<string, ReturnType<typeof vi.fn>> = {};
            // Use .mockReturnThis(), not vi.fn(() => qb): tsc -b rejects the self-referential generic.
            // Plain vitest does not catch this; only the stricter project-build typecheck does.
            qb.where = vi.fn().mockReturnThis();
            qb.leftJoin = vi.fn().mockReturnThis();
            qb.andWhere = vi.fn().mockReturnThis();
            qb.orderBy = vi.fn().mockReturnThis();
            qb.addOrderBy = vi.fn().mockReturnThis();
            qb.take = vi.fn().mockReturnThis();
            qb.skip = vi.fn().mockReturnThis();
            qb.getManyAndCount = vi.fn(async () => [[], 0]) as ReturnType<typeof vi.fn>;
            return qb;
        }

        let qb: ReturnType<typeof mockQueryBuilder>;
        let accessScopeService: {
            resolveOrderScope: ReturnType<typeof vi.fn>;
            applyOwnCounterpartyFilter: ReturnType<typeof vi.fn>;
            managerClause: ReturnType<typeof vi.fn>;
        };

        beforeEach(() => {
            qb = mockQueryBuilder();
            repo.createQueryBuilder = vi.fn(() => qb);
            accessScopeService = {
                resolveOrderScope: vi.fn(),
                applyOwnCounterpartyFilter: vi.fn(),
                managerClause: vi.fn(() => null),
            };
            service = new ReservationReconciliationIssueService(
                connection as unknown as TransactionalConnection,
                notificationService as never,
                accessScopeService as never,
                { getGlobalDefaultBranchId: vi.fn(async () => 'branch-default') } as never,
            );
        });

        it('applies no scope join/filter for "all" scope', async () => {
            accessScopeService.resolveOrderScope.mockResolvedValue({ kind: 'all' });

            await service.findOpen(ctx);

            expect(qb.leftJoin).not.toHaveBeenCalled();
        });

        it('joins order/customer/counterparty and applies applyOwnCounterpartyFilter for "own" scope', async () => {
            accessScopeService.resolveOrderScope.mockResolvedValue({
                kind: 'own',
                administratorId: 'admin-1',
            });

            await service.findOpen(ctx);

            expect(qb.leftJoin).toHaveBeenCalled();
            expect(accessScopeService.applyOwnCounterpartyFilter).toHaveBeenCalledWith(
                qb,
                'counterparty',
                { kind: 'own', administratorId: 'admin-1' },
            );
        });

        it('resolves the order branch at read time for "department" scope, with no IS NULL carve-out', async () => {
            accessScopeService.resolveOrderScope.mockResolvedValue({
                kind: 'department',
                departmentId: 'dept-1',
                branchId: 'branch-1',
            });

            await service.findOpen(ctx);

            const [sql, params] = qb.andWhere.mock.calls[0] as [string, unknown];
            expect(sql).toContain('"o"."customFieldsTradingpointid"');
            expect(sql).not.toContain('customFieldsBranchid');
            expect(sql).not.toContain('IS NULL');
            expect(sql).not.toContain('departmentId');
            expect(params).toEqual({
                branchId: 'branch-1',
                orderDefaultBranchId: 'branch-default',
            });
        });
    });
});
