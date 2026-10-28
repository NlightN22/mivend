import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderChangedStreamHandler } from '../../handlers/order-changed.handler';
import { MissingDependencyError } from '../../types';

function createConnection(rows: Array<Record<string, unknown> | undefined>): {
    getRepository: () => { query: () => Promise<unknown[]> };
} {
    let call = 0;
    const query = async (): Promise<unknown[]> => {
        const row = rows[call];
        call += 1;
        return row ? [row] : [];
    };
    return { getRepository: () => ({ query }) };
}

describe('OrderChangedStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips a deleted event without calling the sync service', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'oc-1', { isDeleted: true });

        expect(syncService.handleOrderChanged).not.toHaveBeenCalled();
    });

    it('imports an order without orderUuid and no local match as an external order, not through the reservation sync', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const upsert = vi.fn().mockResolvedValue({ kind: 'created', counterpartyPending: false });
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            { findByErpOrderId: vi.fn().mockResolvedValue(null), upsert } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        const outcome = await handler.apply(ctx, 'legacy-1', {
            status: '',
            customerId: 'cp-1',
            lines: [{ productId: 'prod-1', quantity: 1, price: 10 }],
        });

        expect(outcome).toEqual({ kind: 'applied' });
        expect(syncService.handleOrderChanged).not.toHaveBeenCalled();
        expect(upsert).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ erpOrderId: 'legacy-1', erpStatus: null }),
        );
    });

    it('reports a pending counterparty as a noop with the reason', async () => {
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            { handleOrderChanged: vi.fn() } as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue(null),
                upsert: vi.fn().mockResolvedValue({ kind: 'created', counterpartyPending: true }),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        const outcome = await handler.apply(ctx, 'legacy-2', { customerId: 'cp-9' });

        expect(outcome).toMatchObject({ kind: 'noop' });
    });

    it('resolves lines productId to a ProductVariant id and passes entityId as orderEntityId', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
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
            linesDiscarded: false,
            contractId: null,
            documentNumber: null,
            derivedStatus: null,
            derivedStatusAt: null,
            paidAmountMinor: null,
            reserveUntil: null,
        });
    });

    it('passes reserve_until (an RFC3339 string on the wire) as a Date', async () => {
        const syncService = { handleOrderChanged: vi.fn() };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            status: '',
            lines: [{ productId: 'prod-1', reservedQuantity: 1 }],
            reserveUntil: '2026-11-01T00:00:00Z',
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ reserveUntil: new Date('2026-11-01T00:00:00Z') }),
        );
    });

    it('converts a line quantity expressed in its unit to base units', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn().mockResolvedValue({ ratioToBase: 0.9 }) } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
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

    it('reads an unknown line unit as base instead of stalling the order', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn().mockResolvedValue(null) } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: 'prod-1', unitId: 'unit-x', reservedQuantity: 4 }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 4 }],
            }),
        );
    });

    it('uses the variant own ratio when the line unit is its default sales unit (no unit lookup)', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const findByEntityId = vi.fn();
        const handler = new OrderChangedStreamHandler(
            createConnection([
                { id: 'variant-1', defaultSalesUnitId: 'unit-pack', unitRatioToBase: 6 },
            ]) as never,
            syncService as never,
            { findByEntityId } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: 'prod-1', unitId: 'unit-pack', reservedQuantity: 2 }],
        });

        expect(findByEntityId).not.toHaveBeenCalled();
        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 12 }],
            }),
        );
    });

    it('passes the variant id as a string even though Postgres returns the integer id as a number', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 27708 }]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
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
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([undefined]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
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
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([{ id: 'variant-1' }]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: 'prod-1' }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 0 }],
            linesDiscarded: false,
            contractId: null,
            documentNumber: null,
            derivedStatus: null,
            derivedStatusAt: null,
            paidAmountMinor: null,
            reserveUntil: null,
        });
    });

    it('drops (and does not report) a line with a missing productId', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [{ productId: '', reservedQuantity: 1 }],
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            linesDiscarded: true,
            contractId: null,
            documentNumber: null,
            derivedStatus: null,
            derivedStatusAt: null,
            paidAmountMinor: null,
            reserveUntil: null,
        });
    });

    // status is a plain proto3 string — absent means '' (zero-value-omission rule), never "skip".
    it('treats an absent status as the empty string, never skipped/null', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
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
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', {
            lines: [],
            contractId: 'contract-guid-1',
            derivedStatus: null,
            derivedStatusAt: null,
        });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ contractId: 'contract-guid-1' }),
        );
    });

    it('passes contractId as null when absent, not fabricated', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [] });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ contractId: null }),
        );
    });

    // document_number (field 15) is a real `optional string` sent on every emission (#218).
    it.each([
        [
            'passes documentNumber through when present',
            { documentNumber: 'DOC-0000020' },
            'DOC-0000020',
        ],
        ['passes documentNumber as null when absent', {}, null],
    ])('%s', async (_name, extra, expected) => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [], ...extra });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ documentNumber: expected }),
        );
    });

    // mivend#207/upstream#180: order_uuid is a real `optional string` on OrderChanged —
    // present only for orders registered through our integration.
    it('passes orderUuid through when present', async () => {
        const syncService = {
            handleOrderChanged: vi.fn(),
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
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
        };
        const handler = new OrderChangedStreamHandler(
            createConnection([]) as never,
            syncService as never,
            { findByEntityId: vi.fn() } as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
                upsert: vi.fn(),
            } as never,
            { attachOrder: vi.fn() } as never,
            { findActive: vi.fn().mockResolvedValue({}) } as never,
        );

        await handler.apply(ctx, 'erp-order-1', { lines: [] });

        expect(syncService.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ orderUuid: null }),
        );
    });

    describe('paidAmount on a mivend order', () => {
        const run = async (payload: Record<string, unknown>): Promise<unknown> => {
            const sync = { handleOrderChanged: vi.fn() };
            const handler = new OrderChangedStreamHandler(
                createConnection([]) as never,
                sync as never,
                { findByEntityId: vi.fn() } as never,
                { findByErpOrderId: vi.fn().mockResolvedValue(null), upsert: vi.fn() } as never,
                { attachOrder: vi.fn() } as never,
                { findActive: vi.fn().mockResolvedValue({}) } as never,
            );
            await handler.apply(ctx, 'oc-1', { orderUuid: 'u-1', lines: [], ...payload });
            return sync.handleOrderChanged.mock.calls[0][1];
        };

        it('passes the paid amount in minor units when present', async () => {
            expect(await run({ paidAmount: 99.9 })).toMatchObject({ paidAmountMinor: 9990 });
        });

        it('passes null when the event does not carry it', async () => {
            expect(await run({})).toMatchObject({ paidAmountMinor: null });
        });
    });
});
