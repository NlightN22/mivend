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
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'oc-1', { isDeleted: true });

        expect(syncService.handleOrderChanged).not.toHaveBeenCalled();
    });

    it('ignores an order without orderUuid that matches no local order', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(true),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        const outcome = await handler.apply(ctx, 'legacy-1', {
            status: 'Проведён',
            lines: [{ productId: 'prod-1', reservedQuantity: 1 }],
        });

        expect(outcome).toMatchObject({ kind: 'noop' });
        expect(syncService.handleOrderChanged).not.toHaveBeenCalled();
    });

    it('resolves lines productId to a ProductVariant id and passes entityId as orderEntityId', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            status: 'Проведён',
            lines: [{ productId: 'prod-1', reservedQuantity: 3.4 }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: 'Проведён',
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 3 }],
            contractId: null,
        });
    });

    it('converts a line quantity expressed in its unit to base units', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn().mockResolvedValue({ ratioToBase: 0.9 }) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: 'prod-1', unitId: 'unit-pack', reservedQuantity: 10 }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 9 }],
            }),
        );
    });

    it('retries (missing dependency) when the line unit has not arrived yet', async () => {
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            {
                handleOrderChanged: vi.fn(),
                isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
            } as never,
            { findByEntityId: vi.fn().mockResolvedValue(null) } as never,
        );

        await expect(
            handler.apply(ctx, 'erp-order-1', {
                lines: [{ productId: 'prod-1', unitId: 'unit-x', reservedQuantity: 1 }],
            }),
        ).rejects.toBeInstanceOf(MissingDependencyError);
    });

    it('passes the variant id as a string even though Postgres returns the integer id as a number', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 27708 }]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [{ productId: 'prod-1' }] });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                reservedLines: [{ productVariantId: '27708', reservedQuantity: 0 }],
            }),
        );
    });

    // Same all-or-nothing eventual-consistency race as OrderRegistrationResultHandler's own
    // identical lookup — throws so processOne() retries via the inbox, never a silent drop.
    it('throws MissingDependencyError for a line whose productId does not resolve to a known variant', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([undefined]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
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
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: 'prod-1' }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 0 }],
            contractId: null,
        });
    });

    it('drops (and does not report) a line with a missing productId', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: '', reservedQuantity: 1 }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: null,
        });
    });

    // status is a plain proto3 string — absent means '' (zero-value-omission rule), never "skip".
    it('treats an absent status as the empty string, never skipped/null', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [] });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ status: '' }),
        );
    });

    // contractId is a real proto `optional string` — presence is genuine, not a zero-value.
    it('passes contractId through when present', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
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
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [] });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ contractId: null }),
        );
    });

    // mivend#207/search-platform#180: order_uuid is a real `optional string` on OrderChanged —
    // present only for orders registered through our integration.
    it('passes orderUuid through when present', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [], orderUuid: 'order-uuid-1' });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ orderUuid: 'order-uuid-1' }),
        );
    });

    it('passes orderUuid as null when absent, for orders not registered through our integration', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
            isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [] });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ orderUuid: null }),
        );
    });
});
