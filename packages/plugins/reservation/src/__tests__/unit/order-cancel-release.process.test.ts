import { describe, expect, it } from 'vitest';
import type { Injector, Order, RequestContext } from '@vendure/core';

import { orderCancelReleaseProcess } from '../../order-cancel-release.process';
import { ReservationService } from '../../reservation.service';

async function run(toState: string, released: number, order: Partial<Order>): Promise<string[]> {
    const calls: string[] = [];
    const reservations = {
        releaseReservations: async (_ctx: RequestContext, id: string) => {
            calls.push(String(id));
            return released;
        },
    };
    orderCancelReleaseProcess.init?.({
        get: (token: unknown) => (token === ReservationService ? reservations : undefined),
    } as unknown as Injector);
    await orderCancelReleaseProcess.onTransitionEnd?.('PaymentSettled', toState as never, {
        ctx: {} as RequestContext,
        order: order as Order,
    });
    return calls;
}

describe('orderCancelReleaseProcess', () => {
    it('releases the reservations of an order entering Cancelled and keeps RELEASED on the trailing save', async () => {
        const order = { id: 7, customFields: { reservationState: 'RESERVED', other: 'kept' } };
        expect(await run('Cancelled', 2, order as never)).toEqual(['7']);
        expect(order.customFields).toEqual({ reservationState: 'RELEASED', other: 'kept' });
    });

    it('leaves the stored state alone when another path already released everything', async () => {
        const order = { id: 7, customFields: { reservationState: 'RELEASED' } };
        expect(await run('Cancelled', 0, order as never)).toEqual(['7']);
        expect(order.customFields.reservationState).toBe('RELEASED');
    });

    it('does nothing on any other transition', async () => {
        const order = { id: 7, customFields: { reservationState: 'RESERVED' } };
        expect(await run('PaymentSettled', 2, order as never)).toEqual([]);
        expect(order.customFields.reservationState).toBe('RESERVED');
    });
});
