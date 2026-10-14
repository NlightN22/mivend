import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderStatusStreamHandler } from '../../handlers/order-status.handler';

const ctx = {} as RequestContext;
const wire = {
    code: 'PICKING',
    name: 'Picking',
    rank: 5,
    terminal: false,
    customerVisible: true,
    description: 'Order is being picked',
    customerGroup: 'confirmed',
    warehouseStarted: true,
    version: '2026-10-14T10:00:00Z',
};

function build(result = 'applied'): {
    handler: OrderStatusStreamHandler;
    apply: ReturnType<typeof vi.fn>;
} {
    const apply = vi.fn().mockResolvedValue(result);
    return { handler: new OrderStatusStreamHandler({ apply } as never), apply };
}

describe('OrderStatusStreamHandler', () => {
    it('maps the wire payload and ignores unknown extra fields', async () => {
        const { handler, apply } = build();

        const outcome = await handler.apply(ctx, 'PICKING', { ...wire, someFutureField: 1 });

        expect(outcome).toEqual({ kind: 'applied' });
        expect(apply.mock.calls[0][1]).toEqual({
            code: 'PICKING',
            version: wire.version,
            isDeleted: false,
            name: 'Picking',
            rank: 5,
            terminal: false,
            customerVisible: true,
            description: 'Order is being picked',
            customerGroup: 'confirmed',
            warehouseStarted: true,
            shipped: false,
            delivered: false,
            cancelled: false,
        });
    });

    it('reads absent plain proto3 scalars as zero values, never as skipped data', async () => {
        const { handler, apply } = build();

        await handler.apply(ctx, 'CANCELLED', { code: 'CANCELLED', version: '1' });

        expect(apply.mock.calls[0][1]).toMatchObject({
            rank: 0,
            terminal: false,
            customerVisible: false,
            description: '',
            customerGroup: '',
            warehouseStarted: false,
            shipped: false,
            delivered: false,
            cancelled: false,
            isDeleted: false,
        });
    });

    it('applies a status code this code has never heard of', async () => {
        const { handler, apply } = build();

        expect(await handler.apply(ctx, 'NEW', { ...wire, code: 'NEW' })).toEqual({
            kind: 'applied',
        });
        expect(apply.mock.calls[0][1].code).toBe('NEW');
    });

    it('passes a tombstone through as deleted', async () => {
        const { handler, apply } = build();

        await handler.apply(ctx, 'PICKING', { ...wire, isDeleted: true });

        expect(apply.mock.calls[0][1].isDeleted).toBe(true);
    });

    it.each([[{ ...wire, code: '' }], [{ ...wire, version: '' }]])(
        'records a noop for a message without code or version',
        async payload => {
            const { handler, apply } = build();

            const outcome = await handler.apply(ctx, 'x', payload);

            expect(outcome.kind).toBe('noop');
            expect(apply).not.toHaveBeenCalled();
        },
    );

    it.each(['stale', 'unknown-deleted', 'protected'])(
        'records a noop for a %s result',
        async result => {
            const { handler } = build(result);

            expect((await handler.apply(ctx, 'PICKING', wire)).kind).toBe('noop');
        },
    );
});
