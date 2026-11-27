import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderChangedStreamHandler } from '../../handlers/order-changed.handler';

const ctx = {} as RequestContext;

function setup(stored: { id: string; isExternal: boolean } | null, beyondWindow = false) {
    const isBeyondWindow = vi.fn().mockResolvedValue(beyondWindow);
    const sync = { handleOrderChanged: vi.fn() };
    const upsert = vi.fn().mockResolvedValue({ kind: 'created', counterpartyPending: false });
    const resolve = vi
        .fn()
        .mockResolvedValue({ lines: [], withoutProductId: 0, unknownProducts: 0 });
    const handler = new OrderChangedStreamHandler(
        sync as never,
        { resolve } as never,
        { findByErpOrderId: vi.fn().mockResolvedValue(stored), upsert } as never,
        { attachOrder: vi.fn() } as never,
        { isBeyondWindow } as never,
    );
    return { handler, sync, upsert, resolve, isBeyondWindow };
}

describe('OrderChangedStreamHandler', () => {
    it('skips a deleted event without calling the sync service', async () => {
        const { handler, sync } = setup({ id: '1', isExternal: false });
        await handler.apply(ctx, 'oc-1', { isDeleted: true });
        expect(sync.handleOrderChanged).not.toHaveBeenCalled();
    });

    it('hands a mivend order only its own data: no lines are resolved and nothing is derived', async () => {
        const { handler, sync, resolve } = setup({ id: '1', isExternal: false });

        await handler.apply(ctx, 'erp-order-1', {
            status: 'Проведён',
            orderUuid: 'u-1',
            contractId: 'c-1',
            documentNumber: 'D-1',
            reserveUntil: '2026-11-01T00:00:00Z',
            accounting: { reflectInManagement: true },
            lines: [{ productId: 'prod-1', quantity: 2 }],
        });

        expect(resolve).not.toHaveBeenCalled();
        expect(sync.handleOrderChanged).toHaveBeenCalledWith(ctx, {
            orderUuid: 'u-1',
            orderEntityId: 'erp-order-1',
            status: 'Проведён',
            contractId: 'c-1',
            documentNumber: 'D-1',
            erpFacts: { erpAccounting: '{"reflectInManagement":true}' },
            reserveUntil: new Date('2026-11-01T00:00:00Z'),
        });
    });

    it('passes absent optionals as null and an absent status as the empty string', async () => {
        const { handler, sync } = setup({ id: '1', isExternal: false });
        await handler.apply(ctx, 'erp-order-1', { orderUuid: 'u-1' });
        expect(sync.handleOrderChanged).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                status: '',
                contractId: null,
                documentNumber: null,
                reserveUntil: null,
                erpFacts: {},
            }),
        );
    });

    it('imports an order without orderUuid and no local match as an external order, with nothing derived', async () => {
        const { handler, sync, upsert, resolve } = setup(null);

        const outcome = await handler.apply(ctx, 'legacy-1', {
            status: '',
            customerId: 'cp-1',
            lines: [{ productId: 'prod-1', quantity: 1, price: 10 }],
        });

        expect(outcome).toEqual({ kind: 'applied' });
        expect(sync.handleOrderChanged).not.toHaveBeenCalled();
        expect(resolve).toHaveBeenCalledWith(
            ctx,
            'order-changed',
            'legacy-1',
            [{ productId: 'prod-1', quantity: 1, price: 10 }],
            true,
        );
        expect(upsert).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                erpOrderId: 'legacy-1',
                erpStatus: null,
                paidAmountMinor: null,
            }),
        );
    });

    it('accepts a not-posted order with an empty customerId as an external order without counterparty', async () => {
        const { handler, upsert } = setup(null);
        const outcome = await handler.apply(ctx, 'draft-1', {
            isPosted: false,
            customerId: '',
            status: 'Draft',
        });
        expect(outcome).toEqual({ kind: 'applied' });
        expect(upsert).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ counterpartyErpId: null, isPosted: false }),
        );
    });

    it('keeps updating an order stored as external even when the event carries an orderUuid', async () => {
        const { handler, sync, upsert } = setup({ id: '1', isExternal: true });
        await handler.apply(ctx, 'legacy-1', { orderUuid: 'u-1' });
        expect(upsert).toHaveBeenCalled();
        expect(sync.handleOrderChanged).not.toHaveBeenCalled();
    });

    it('reports a pending counterparty and skipped lines as a noop with the reason', async () => {
        const { handler, upsert, resolve } = setup(null);
        upsert.mockResolvedValue({ kind: 'created', counterpartyPending: true });
        resolve.mockResolvedValue({ lines: [], withoutProductId: 1, unknownProducts: 1 });

        const outcome = await handler.apply(ctx, 'legacy-2', { customerId: 'cp-9' });

        expect(outcome).toMatchObject({ kind: 'noop' });
        expect(JSON.stringify(outcome)).toContain('2 line(s) without a known product skipped');
    });

    describe('deletion-marked unknown order outside the retention window (#411)', () => {
        const old = { markedForDeletion: true, orderDate: '2020-01-01T00:00:00Z' };

        it('is not created and reports a noop with the reason; a repeat is the same noop', async () => {
            const { handler, upsert, resolve } = setup(null, true);
            for (let i = 0; i < 2; i += 1) {
                const outcome = await handler.apply(ctx, 'old-1', old);
                expect(outcome).toMatchObject({ kind: 'noop' });
                expect(JSON.stringify(outcome)).toContain('retention window');
            }
            expect(upsert).not.toHaveBeenCalled();
            expect(resolve).not.toHaveBeenCalled();
        });

        it('is created when inside the window', async () => {
            const { handler, upsert } = setup(null, false);
            await handler.apply(ctx, 'new-1', old);
            expect(upsert).toHaveBeenCalledTimes(1);
        });

        it('is created when the order date is absent', async () => {
            const { handler, upsert, isBeyondWindow } = setup(null, true);
            await handler.apply(ctx, 'nodate-1', { markedForDeletion: true });
            expect(isBeyondWindow).not.toHaveBeenCalled();
            expect(upsert).toHaveBeenCalledTimes(1);
        });

        it('does not affect an unmarked order or a stored external order', async () => {
            const unmarked = setup(null, true);
            await unmarked.handler.apply(ctx, 'u-1', { orderDate: old.orderDate });
            expect(unmarked.upsert).toHaveBeenCalledTimes(1);

            const stored = setup({ id: '1', isExternal: true }, true);
            await stored.handler.apply(ctx, 'u-2', old);
            expect(stored.upsert).toHaveBeenCalledTimes(1);
        });
    });
});
