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
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function createMockNotificationRecipientService() {
        return { getCurrentAdministrator: vi.fn(async () => null as unknown) };
    }

    let repo: ReturnType<typeof createMockRepo>;
    let notificationService: ReturnType<typeof createMockNotificationService>;
    let notificationRecipientService: ReturnType<typeof createMockNotificationRecipientService>;
    let service: PaymentReconciliationIssueService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        notificationService = createMockNotificationService();
        notificationRecipientService = createMockNotificationRecipientService();
        const connection = { getRepository: vi.fn(() => repo) };
        service = new PaymentReconciliationIssueService(
            connection as unknown as TransactionalConnection,
            notificationService as never,
            notificationRecipientService as never,
        );
    });

    it('does not create a Notification when no administrator is resolvable from ctx (webhook/inbox-triggered path)', async () => {
        await service.report(ctx, 'AMOUNT_MISMATCH', { invoiceId: 1 });

        expect(notificationRecipientService.getCurrentAdministrator).toHaveBeenCalledWith(ctx);
        expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('creates a warning Notification for the resolved administrator', async () => {
        notificationRecipientService.getCurrentAdministrator.mockResolvedValue({
            recipientType: 'administrator',
            recipientId: 'admin-1',
        } as never);

        await service.report(ctx, 'AMOUNT_MISMATCH', { invoiceId: 1 });

        expect(notificationService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                recipientType: 'administrator',
                recipientId: 'admin-1',
                kind: 'warning',
                sourceType: 'payment-reconciliation',
            }),
        );
    });
});
