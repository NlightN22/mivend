import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderRegistrationResultHandler } from '../../handlers/order-registration-result.handler';

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
        });
    });

    it('drops a line whose productId does not resolve to a known variant', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection([undefined]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [{ productId: 'unknown-prod', reservedQuantity: 1 }],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [],
        });
    });

    it('drops a line with a missing productId/reservedQuantity', async () => {
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
        });
    });
});
