import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { PaymentReconciliationIssueService } from '../../payment-reconciliation-issue.service';

// issue #87 Part 2: report() now also emits a unified Notification, additive to the existing
// PaymentReconciliationIssue row (system-of-record, unchanged) — see
// ReservationReconciliationIssueService's own test file for the same pattern.
describe('PaymentReconciliationIssueService.report — Notification wiring', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
    function createMockRepo() {
        return {
            create: vi.fn((fields: unknown) => fields),
            save: vi.fn(async (row: unknown) => row),
        };
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function createMockNotificationService() {
        return { create: vi.fn(async () => ({})) };
    }

    let repo: ReturnType<typeof createMockRepo>;
    let notificationService: ReturnType<typeof createMockNotificationService>;
    let service: PaymentReconciliationIssueService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        notificationService = createMockNotificationService();
        const connection = { getRepository: vi.fn(() => repo) };
        service = new PaymentReconciliationIssueService(
            connection as unknown as TransactionalConnection,
            notificationService as never,
            { resolveScope: vi.fn(async () => ({ kind: 'all' })) } as never,
        );
    });

    // PaymentAttemptService (the only caller) runs from webhook/inbox processing with no
    // signed-in administrator — rather than skip notifying, this broadcasts to every
    // administrator instead (issue #87 Part 2).
    it('creates an administrator-broadcast Notification (webhook/inbox-triggered path, no signed-in administrator)', async () => {
        await service.report(ctx, 'AMOUNT_MISMATCH', { invoiceId: 1 });

        expect(notificationService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                recipientType: 'administrator-broadcast',
                kind: 'warning',
                sourceType: 'payment-reconciliation',
            }),
        );
    });
});

// mivend.audit.common's HIGH finding on issue #76: findOpen had no branch/counterparty scoping
// at all, so a branch-scoped manager saw payment reconciliation issues company-wide. Mirrors
// InvoiceVisibilityService's own consuming pattern (PaymentVisibilityService) — this reuses
// InvoiceVisibilityService.applyScope against an invoice/counterparty join.
describe('PaymentReconciliationIssueService.findOpen — scope filtering', () => {
    function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
        const qb: Record<string, ReturnType<typeof vi.fn>> = {};
        qb.where = vi.fn(() => qb);
        qb.innerJoin = vi.fn(() => qb);
        qb.leftJoin = vi.fn(() => qb);
        qb.andWhere = vi.fn(() => qb);
        qb.orderBy = vi.fn(() => qb);
        qb.addOrderBy = vi.fn(() => qb);
        qb.take = vi.fn(() => qb);
        qb.skip = vi.fn(() => qb);
        qb.getManyAndCount = vi.fn(async () => [[], 0]);
        return qb;
    }

    let qb: ReturnType<typeof mockQueryBuilder>;
    let service: PaymentReconciliationIssueService;
    let invoiceVisibilityService: {
        resolveScope: ReturnType<typeof vi.fn>;
        applyScope: ReturnType<typeof vi.fn>;
    };
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        qb = mockQueryBuilder();
        const repo = { createQueryBuilder: vi.fn(() => qb) };
        const connection = { getRepository: vi.fn(() => repo) };
        invoiceVisibilityService = {
            resolveScope: vi.fn(),
            applyScope: vi.fn(),
        };
        service = new PaymentReconciliationIssueService(
            connection as unknown as TransactionalConnection,
            { create: vi.fn(async () => ({})) } as never,
            invoiceVisibilityService as never,
        );
    });

    it('applies no invoice join for "all" scope', async () => {
        invoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });

        await service.findOpen(ctx);

        expect(qb.innerJoin).not.toHaveBeenCalled();
        expect(invoiceVisibilityService.applyScope).not.toHaveBeenCalled();
    });

    it('inner-joins Invoice and delegates to InvoiceVisibilityService.applyScope for "own"/"department" scope', async () => {
        const scope = { kind: 'department', departmentId: 'dept-1', branchId: 'branch-1' };
        invoiceVisibilityService.resolveScope.mockResolvedValue(scope);

        await service.findOpen(ctx);

        expect(qb.innerJoin).toHaveBeenCalled();
        expect(invoiceVisibilityService.applyScope).toHaveBeenCalledWith(qb, scope);
    });
});
