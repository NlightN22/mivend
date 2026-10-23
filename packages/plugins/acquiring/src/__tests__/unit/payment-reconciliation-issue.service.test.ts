import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { PaymentReconciliationIssueService } from '../../payment-reconciliation-issue.service';

// The PaymentReconciliationIssue row stays the system of record; this Notification is additive.
// report() emits both, so the existing issue row is never replaced.
describe('PaymentReconciliationIssueService.report — Notification wiring', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
    function createMockRepo() {
        return {
            create: vi.fn((fields: unknown) => fields),
            save: vi.fn(async (row: unknown) => row),
            findOne: vi.fn(async () => ({ id: 1, orderId: 7 })),
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

    // Called from webhook/inbox processing with no signed-in admin, so notify all administrators.
    //
    it('creates an administrator-broadcast Notification (webhook/inbox-triggered path, no signed-in administrator)', async () => {
        await service.report(ctx, 'AMOUNT_MISMATCH', { proformaInvoiceId: 1 });

        expect(notificationService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                recipientType: 'administrator-broadcast',
                kind: 'warning',
                sourceType: 'payment-reconciliation',
                orderId: '7',
            }),
        );
    });
});

// findOpen had no branch/counterparty scoping, exposing issues company-wide to branch managers.
// Reuses ProformaInvoiceVisibilityService.applyScope via a proforma invoice/counterparty join.
describe('PaymentReconciliationIssueService.findOpen — scope filtering', () => {
    function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
        const qb: Record<string, ReturnType<typeof vi.fn>> = {};
        // Use mockReturnThis, not vi.fn(() => qb): the self-referential generic fails tsc -b typecheck.
        // Plain vitest does not catch this; only the stricter project build does.
        qb.where = vi.fn().mockReturnThis();
        qb.innerJoin = vi.fn().mockReturnThis();
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
    let service: PaymentReconciliationIssueService;
    let proformaInvoiceVisibilityService: {
        resolveScope: ReturnType<typeof vi.fn>;
        applyScope: ReturnType<typeof vi.fn>;
    };
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        qb = mockQueryBuilder();
        const repo = { createQueryBuilder: vi.fn(() => qb) };
        const connection = { getRepository: vi.fn(() => repo) };
        proformaInvoiceVisibilityService = {
            resolveScope: vi.fn(),
            applyScope: vi.fn(),
        };
        service = new PaymentReconciliationIssueService(
            connection as unknown as TransactionalConnection,
            { create: vi.fn(async () => ({})) } as never,
            proformaInvoiceVisibilityService as never,
        );
    });

    it('applies no proforma invoice join for "all" scope', async () => {
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });

        await service.findOpen(ctx);

        expect(qb.innerJoin).not.toHaveBeenCalled();
        expect(proformaInvoiceVisibilityService.applyScope).not.toHaveBeenCalled();
    });

    it('inner-joins ProformaInvoice and delegates to ProformaInvoiceVisibilityService.applyScope for "own"/"department" scope', async () => {
        const scope = { kind: 'department', departmentId: 'dept-1', branchId: 'branch-1' };
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue(scope);

        await service.findOpen(ctx);

        expect(qb.innerJoin).toHaveBeenCalled();
        expect(proformaInvoiceVisibilityService.applyScope).toHaveBeenCalledWith(qb, scope);
    });
});
