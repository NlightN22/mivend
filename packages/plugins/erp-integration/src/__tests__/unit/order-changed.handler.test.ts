import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderChangedStreamHandler } from '../../handlers/order-changed.handler';
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

describe('OrderChangedStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips a deleted event without calling the sync service', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'oc-1', { isDeleted: true });

        expect(syncService.handleOrderChanged).not.toHaveBeenCalled();
    });

    it('resolves lines productId to a ProductVariant id and passes entityId as orderEntityId', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            status: 'Проведён',
            lines: [{ productId: 'prod-1', reservedQuantity: 3.4 }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'erp-order-1',
            status: 'Проведён',
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 3 }],
            contractId: null,
        });
    });

    // Same all-or-nothing eventual-consistency race as OrderRegistrationResultHandler's own
    // identical lookup — throws so processOne() retries via the inbox, never a silent drop.
    it('throws MissingDependencyError for a line whose productId does not resolve to a known variant', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([undefined]) as never,
            syncService as never,
        );

        await expect(
            handler.apply(ctx, 'erp-order-1', {
                lines: [{ productId: 'unknown-prod', reservedQuantity: 1 }],
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(syncService.handleOrderChanged).not.toHaveBeenCalled();
    });

    // reservedQuantity is a plain (non-optional) proto3 double — an absent key means 0, not a
    // dropped line (same zero-value-omission rule as order-registration-result's own field).
    it('applies a line with an absent reservedQuantity as an explicit 0, not a dropped line', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: 'prod-1' }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 0 }],
            contractId: null,
        });
    });

    it('drops (and does not report) a line with a missing productId', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: '', reservedQuantity: 1 }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: null,
        });
    });

    // status is a plain proto3 string — absent means '' (zero-value-omission rule), never "skip".
    it('treats an absent status as the empty string, never skipped/null', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [] });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ status: '' }),
        );
    });

    // contractId is a real proto `optional string` — presence is genuine, not a zero-value.
    it('passes contractId through when present', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [],
            contractId: 'contract-guid-1',
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ contractId: 'contract-guid-1' }),
        );
    });

    it('passes contractId as null when absent, not fabricated', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [] });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ contractId: null }),
        );
    });
});
