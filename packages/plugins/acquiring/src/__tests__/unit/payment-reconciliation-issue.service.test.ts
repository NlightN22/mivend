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
