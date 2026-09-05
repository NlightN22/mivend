import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationReconciliationIssueService } from '../../reservation-reconciliation-issue.service';

describe('ReservationReconciliationIssueService', () => {
    let repo: {
        findOne: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
    };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let service: ReservationReconciliationIssueService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = {
            findOne: vi.fn(async () => null),
            create: vi.fn((fields: unknown) => fields),
            save: vi.fn(async (row: unknown) => row),
        };
        connection = { getRepository: vi.fn(() => repo) };
        service = new ReservationReconciliationIssueService(
            connection as unknown as TransactionalConnection,
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
});
