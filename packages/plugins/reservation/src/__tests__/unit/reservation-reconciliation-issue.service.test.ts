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
        );
    });

    // mivend.audit.72's second-pass MEDIUM finding: handleOrderRegistrationResult isn't atomic —
    // a retry after a partial failure re-runs the whole handler, so report() must not insert a
    // second row for the same still-open drift.
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

    // handleOrderRegistrationResult runs from an inbox handler with no signed-in administrator —
    // rather than skip notifying (the old behavior), this now broadcasts to every administrator
    // (issue #87 Part 2).
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

    // mivend.audit.common's HIGH finding on issue #76: findOpen had no branch/counterparty
    // scoping at all, so a branch-scoped manager saw reconciliation issues company-wide. Mirrors
    // OrderVisibilityService's own mock-query-builder unit test style (see
    // order-visibility.service.test.ts) since this joins the same order/customer/counterparty
    // shape the real query does.
    describe('findOpen scope filtering', () => {
        function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
            const qb: Record<string, ReturnType<typeof vi.fn>> = {};
            // .mockReturnThis() (not `vi.fn(() => qb)`) avoids a self-referential generic that
            // `tsc -b`'s stricter project-build typecheck rejects (not caught by `make test`'s
            // plain vitest run — surfaced only when packages/dashboard's Docker build ran
            // `pnpm build:plugins`, issue #115).
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
        };

        beforeEach(() => {
            qb = mockQueryBuilder();
            repo.createQueryBuilder = vi.fn(() => qb);
            accessScopeService = {
                resolveOrderScope: vi.fn(),
                applyOwnCounterpartyFilter: vi.fn(),
            };
            service = new ReservationReconciliationIssueService(
                connection as unknown as TransactionalConnection,
                notificationService as never,
                accessScopeService as never,
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
                'admin-1',
            );
        });

        it('filters by department + order\'s own branch (with a branch-less OR NULL) for "department" scope', async () => {
            accessScopeService.resolveOrderScope.mockResolvedValue({
                kind: 'department',
                departmentId: 'dept-1',
                branchId: 'branch-1',
            });

            await service.findOpen(ctx);

            expect(qb.andWhere).toHaveBeenCalledWith(
                expect.stringContaining('counterparty.departmentId = :departmentId'),
                { departmentId: 'dept-1', branchId: 'branch-1' },
            );
            const [sql] = qb.andWhere.mock.calls.find(
                (call: unknown[]) =>
                    typeof call[0] === 'string' && call[0].includes('departmentId'),
            ) as [string, unknown];
            expect(sql).toContain('IS NULL');
        });
    });
});
