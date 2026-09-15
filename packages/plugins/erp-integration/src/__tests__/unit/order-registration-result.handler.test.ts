import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderRegistrationResultHandler } from '../../handlers/order-registration-result.handler';
import { MissingDependencyError } from '../../types';

function createConnection(rows: Array<Record<string, unknown> | undefined>): {
    rawConnection: { createQueryBuilder: () => unknown };
} {
    let call = 0;
    return {
        rawConnection: {
            createQueryBuilder: () => {
                const row = rows[call];
                call += 1;
                return {
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    innerJoin: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    getRawOne: vi.fn().mockResolvedValue(row),
                };
            },
        },
    };
}

describe('OrderRegistrationResultHandler', () => {
    const ctx = {} as RequestContext;

    it('skips a deleted event without calling the sync service', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', { isDeleted: true });

        expect(syncService.handleOrderRegistrationResult).not.toHaveBeenCalled();
    });

    it('passes rejected=true and no reservedLines when businessRejectionReason is present', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            businessRejectionReason: { code: 'X', message: 'nope' },
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
        });
    });

    it('resolves reservedLines productId to a ProductVariant id', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [{ productId: 'prod-1', reservedQuantity: 3.4 }],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 3 }],
            unresolvedProductIds: [],
        });
    });

    // Issue #96: a productId that doesn't resolve yet is an ordinary eventual-consistency race
    // (the product stream may simply not have been consumed yet) — this now throws
    // MissingDependencyError so processOne() retries with backoff instead of the previous
    // behavior (mivend.audit.72) of reporting it immediately as a permanent reconciliation issue
    // on the very first attempt. A genuinely stale mapping still surfaces visibly once the 24h
    // wall-clock retry budget is exhausted (inbox 'failed', not silent).
    it('throws MissingDependencyError for a line whose productId does not resolve to a known variant', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection([undefined]) as never,
            syncService as never,
        );

        await expect(
            handler.apply(ctx, 'orr-1', {
                orderEntityId: 'erp-order-1',
                reservedLines: [{ productId: 'unknown-prod', reservedQuantity: 1 }],
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(syncService.handleOrderRegistrationResult).not.toHaveBeenCalled();
    });

    // mivend.issue.84.88: `reservedQuantity` is a plain (non-optional) proto3 double — an absent
    // key means reservedQuantity=0 (a fully-cancelled/zeroed line), not a malformed line. A prior
    // revision defaulted the missing key to NaN and dropped the whole line.
    it('applies a line with an absent reservedQuantity as an explicit 0, not a dropped line', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [{ productId: 'prod-1' }],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 0 }],
            unresolvedProductIds: [],
        });
    });

    it('drops (and does not report) a line with a missing productId', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [{ productId: '', reservedQuantity: 1 }],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
        });
    });

    it('passes orderEntityId=null through untouched when absent', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            businessRejectionReason: { code: 'X', message: 'no order created' },
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderEntityId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
        });
    });
});
