import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { UnknownOrderUuidError } from '@mivend/plugin-reservation';

import { OrderCancelResultHandler } from '../../handlers/order-cancel-result.handler';

const ctx = {} as RequestContext;
const UUID = '22222222-2222-4222-8222-222222222222';

function setup(outcome = 'cancelled'): {
    handler: OrderCancelResultHandler;
    apply: ReturnType<typeof vi.fn>;
} {
    const apply = vi.fn(async () => outcome);
    return { handler: new OrderCancelResultHandler({ apply } as never), apply };
}

describe('OrderCancelResultHandler', () => {
    it('passes a cancelled answer to the cancellation service and reports it applied', async () => {
        const { handler, apply } = setup('cancelled');

        const result = await handler.apply(ctx, 'e-1', { orderUuid: UUID, status: 'cancelled' });

        expect(result).toEqual({ kind: 'applied' });
        expect(apply).toHaveBeenCalledWith(ctx, {
            orderUuid: UUID,
            status: 'cancelled',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    it('passes the business rejection reason of a rejected answer', async () => {
        const { handler, apply } = setup('refusal-recorded');

        const result = await handler.apply(ctx, 'e-1', {
            orderUuid: UUID,
            status: 'rejected',
            businessRejectionReason: { code: 'IN_PROGRESS', message: 'warehouse order exists' },
        });

        expect(result).toEqual({ kind: 'applied' });
        expect(apply).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                rejectionReasonCode: 'IN_PROGRESS',
                rejectionReasonText: 'warehouse order exists',
            }),
        );
    });

    it.each([
        ['already-cancelled', 'order already cancelled'],
        ['refusal-repeated', 'refusal already recorded'],
        ['refusal-without-request', 'refusal without a request'],
    ])('reports %s as a no-op with its reason', async (outcome, reason) => {
        const { handler } = setup(outcome);

        const result = await handler.apply(ctx, 'e-1', { orderUuid: UUID, status: 'cancelled' });

        expect(result).toMatchObject({ kind: 'noop', reason: expect.stringContaining(reason) });
    });

    it.each([
        ['a tombstone', { isDeleted: true, orderUuid: UUID, status: 'cancelled' }],
        ['no orderUuid', { status: 'cancelled' }],
        ['an unknown status', { orderUuid: UUID, status: 'pending' }],
    ])('records %s as a no-op without calling the service', async (_name, payload) => {
        const { handler, apply } = setup();

        const result = await handler.apply(ctx, 'e-1', payload);

        expect(result.kind).toBe('noop');
        expect(apply).not.toHaveBeenCalled();
    });

    it('lets an unknown order uuid propagate so the inbox retries it (#211)', async () => {
        const failing = new OrderCancelResultHandler({
            apply: async () => {
                throw new UnknownOrderUuidError('no order');
            },
        } as never);

        await expect(
            failing.apply(ctx, 'e-1', { orderUuid: UUID, status: 'cancelled' }),
        ).rejects.toBeInstanceOf(UnknownOrderUuidError);
    });
});
