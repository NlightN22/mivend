import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { UnknownOrderUuidError } from '@mivend/plugin-reservation';

import { OrderStateStreamHandler } from '../../handlers/order-state.handler';
import { MissingDependencyError } from '../../types';

const ctx = {} as RequestContext;

function setup(
    stored: { id: string; isExternal: boolean } | null,
    knownStatus = true,
    resolved = {
        lines: [
            {
                productVariantId: '7',
                ratioToBase: 2,
                raw: { reservedQuantity: 3 } as Record<string, unknown>,
            },
        ],
        withoutProductId: 0,
        unknownProducts: 0,
    },
) {
    const sync = { handleOrderState: vi.fn() };
    const external = {
        findByErpOrderId: vi.fn().mockResolvedValue(stored),
        applyDerived: vi.fn().mockResolvedValue(true),
    };
    const resolve = vi.fn().mockResolvedValue(resolved);
    const handler = new OrderStateStreamHandler(
        sync as never,
        external as never,
        { resolve } as never,
        { dictionary: async () => ({ get: () => (knownStatus ? {} : undefined) }) } as never,
    );
    return { handler, sync, external, resolve };
}

const mivend = { id: '1', isExternal: false };

describe('OrderStateStreamHandler', () => {
    it('skips a tombstone', async () => {
        const { handler, sync, external } = setup(mivend);
        expect(await handler.apply(ctx, 'o-1', { isDeleted: true })).toMatchObject({
            kind: 'noop',
        });
        expect(sync.handleOrderState).not.toHaveBeenCalled();
        expect(external.findByErpOrderId).not.toHaveBeenCalled();
    });

    it('hands a mivend order the reserve in base units, the derived status, the paid amount and the facts', async () => {
        const { handler, sync, resolve } = setup(mivend);

        const outcome = await handler.apply(ctx, 'o-1', {
            statusCode: 'PICKING',
            updatedAt: '2026-11-02T10:00:00Z',
            paidAmount: 12.5,
            linkedDocuments: [
                { kind: 'realization', id: 'd-1', accounting: { reflectInManagement: true } },
            ],
            lines: [{ productId: 'p-1', reservedQuantity: 3 }],
        });

        expect(outcome).toEqual({ kind: 'applied' });
        expect(resolve).toHaveBeenCalledWith(
            ctx,
            'order-state',
            'o-1',
            [{ productId: 'p-1', reservedQuantity: 3 }],
            false,
        );
        expect(sync.handleOrderState).toHaveBeenCalledWith(ctx, {
            orderEntityId: 'o-1',
            reservedLines: [{ productVariantId: '7', reservedQuantity: 6 }],
            linesDiscarded: false,
            derivedStatus: 'PICKING',
            derivedStatusAt: new Date('2026-11-02T10:00:00Z'),
            paidAmountMinor: 1250,
            erpFacts: {
                erpLinkedDocuments:
                    '[{"kind":"realization","id":"d-1","accounting":{"reflectInManagement":true}}]',
            },
        });
    });

    it('leaves a line without a computed reserve out and marks the set incomplete, never reading it as 0', async () => {
        const { handler, sync } = setup(mivend, true, {
            lines: [
                { productVariantId: '7', ratioToBase: 1, raw: { reservedQuantity: 2 } },
                { productVariantId: '8', ratioToBase: 1, raw: {} as Record<string, unknown> },
            ],
            withoutProductId: 0,
            unknownProducts: 0,
        });
        await handler.apply(ctx, 'o-1', { lines: [] });
        const input = sync.handleOrderState.mock.calls[0][1];
        expect(input.reservedLines).toEqual([{ productVariantId: '7', reservedQuantity: 2 }]);
        expect(input.linesDiscarded).toBe(true);
    });

    it('derives nothing from an event without a status code or paid amount', async () => {
        const { handler, sync } = setup(mivend);
        await handler.apply(ctx, 'o-1', {});
        expect(sync.handleOrderState).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ derivedStatus: null, paidAmountMinor: null, erpFacts: {} }),
        );
    });

    it('retries a status code the dictionary does not carry yet', async () => {
        const { handler, sync } = setup(mivend, false);
        await expect(
            handler.apply(ctx, 'o-1', { statusCode: 'SOME_FUTURE_CODE' }),
        ).rejects.toBeInstanceOf(MissingDependencyError);
        expect(sync.handleOrderState).not.toHaveBeenCalled();
    });

    it('retries while no order has this ERP id yet', async () => {
        const { handler } = setup(null);
        await expect(handler.apply(ctx, 'o-1', {})).rejects.toBeInstanceOf(UnknownOrderUuidError);
    });

    it('applies the derived values to an ERP-created order through the external order service', async () => {
        const { handler, sync, external, resolve } = setup({ id: '2', isExternal: true });

        await handler.apply(ctx, 'o-2', { statusCode: 'DELIVERED', paidAmount: 5 });

        expect(resolve).not.toHaveBeenCalled();
        expect(sync.handleOrderState).not.toHaveBeenCalled();
        expect(external.applyDerived).toHaveBeenCalledWith(ctx, 'o-2', {
            erpStatus: 'DELIVERED',
            erpStatusAt: null,
            paidAmountMinor: 500,
            erpFacts: {},
        });
    });

    it('applies the same event twice to the same arguments (idempotent input)', async () => {
        const { handler, sync } = setup(mivend);
        const payload = { statusCode: 'PICKING', paidAmount: 1 };
        await handler.apply(ctx, 'o-1', payload);
        await handler.apply(ctx, 'o-1', payload);
        expect(sync.handleOrderState.mock.calls[0][1]).toEqual(
            sync.handleOrderState.mock.calls[1][1],
        );
    });
});
