import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { OrderChangedStreamHandler } from '../../handlers/order-changed.handler';
import { passThroughOrderVersions } from '../order-version-stub';
import { OrderCorrectionStreamHandler } from '../../handlers/order-correction.handler';
import { SalesCorrectionStreamHandler } from '../../handlers/sales-correction.handler';

const ctx = {} as RequestContext;
const body = { version: '10', updatedAt: '2026-11-08T10:00:00Z', number: '7', orderId: 'o-1' };

const handlers = {
    'order-correction': (writer: { write: unknown }) =>
        new OrderCorrectionStreamHandler(writer as never),
    'sales-correction': (writer: { write: unknown }) =>
        new SalesCorrectionStreamHandler(
            writer as never,
            {
                codeOf: vi.fn().mockResolvedValue(null),
            } as never,
        ),
};

describe.each(Object.entries(handlers))('%s counts only posted, unmarked versions', (_, make) => {
    const stored = async (flags: Record<string, unknown>): Promise<unknown> => {
        const writer = { write: vi.fn().mockResolvedValue('applied') };
        await make(writer).apply(ctx, 'c-1', { ...body, ...flags });
        return writer.write.mock.calls[0][1];
    };

    it('stores a not-posted version as removed, with its body', async () => {
        expect(await stored({ isPosted: false })).toMatchObject({ isDeleted: true, hasBody: true });
    });

    it('stores a deletion-marked version as removed', async () => {
        expect(await stored({ isPosted: true, isDeletionMarked: true })).toMatchObject({
            isDeleted: true,
        });
    });

    it('counts a posted unmarked version, and absent flags keep the old behaviour', async () => {
        expect(await stored({ isPosted: true, isDeletionMarked: false })).toMatchObject({
            isDeleted: false,
        });
        expect(await stored({})).toMatchObject({ isDeleted: false });
    });

    it('keeps a vanished row (is_deleted without a body) a tombstone', async () => {
        const writer = { write: vi.fn().mockResolvedValue('applied') };
        await make(writer).apply(ctx, 'c-1', { version: '11', isDeleted: true });
        expect(writer.write.mock.calls[0][1]).toMatchObject({ isDeleted: true, hasBody: false });
    });
});

describe('order-changed deletion mark', () => {
    const setup = (existing: unknown): { handler: OrderChangedStreamHandler; upsert: Mock } => {
        const upsert = vi.fn().mockResolvedValue({ kind: 'updated', counterpartyPending: false });
        const handler = new OrderChangedStreamHandler(
            { handleOrderChanged: vi.fn() } as never,
            {
                resolve: vi.fn().mockResolvedValue({
                    lines: [],
                    withoutProductId: 0,
                    unknownProducts: 0,
                }),
            } as never,
            { findByErpOrderId: vi.fn().mockResolvedValue(existing), upsert } as never,
            { attachOrder: vi.fn() } as never,
            { isBeyondWindow: vi.fn().mockResolvedValue(false) } as never,
            passThroughOrderVersions,
        );
        return { handler, upsert };
    };

    it('applies a marked order through the external order, not as a noop', async () => {
        const { handler, upsert } = setup({ id: '1', isExternal: true });
        const outcome = await handler.apply(ctx, 'o-1', {
            markedForDeletion: true,
            isPosted: true,
        });
        expect(outcome.kind).toBe('applied');
        expect(upsert).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ markedForDeletion: true, isPosted: true }),
        );
    });

    it('a vanished row stays a noop even with the mark set', async () => {
        const { handler, upsert } = setup(null);
        const outcome = await handler.apply(ctx, 'o-1', {
            isDeleted: true,
            markedForDeletion: true,
        });
        expect(outcome.kind).toBe('noop');
        expect(upsert).not.toHaveBeenCalled();
    });
});
