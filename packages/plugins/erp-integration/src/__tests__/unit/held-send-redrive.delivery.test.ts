import { describe, it, expect, vi } from 'vitest';
import { OrderDeliveryEditedEvent } from '@mivend/plugin-reservation';
import { HeldSendRedriveService } from '../../order-checks/held-send-redrive.service';
import {
    COURIER_POINT_UNCONFIRMED_SKIP_REASON,
    COURIER_WITHOUT_POINT_SKIP_REASON,
} from '../../order-submitted.builder';

describe('HeldSendRedriveService on a staff delivery edit', () => {
    it("rebuilds the order's courier-without-point skipped row right away", async () => {
        const handlers = new Map<unknown, (e: unknown) => unknown>();
        const eventBus = {
            ofType: (cls: unknown) => ({
                subscribe: (fn: (e: unknown) => unknown) => handlers.set(cls, fn),
            }),
        };
        const dataSource = { query: vi.fn().mockResolvedValue([{ id: '11' }]) };
        const recovery = { rebuildSkipped: vi.fn().mockResolvedValue('queued') };
        const service = new HeldSendRedriveService(
            eventBus as never,
            dataSource as never,
            recovery as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            { instanceType: 'central' } as never,
        );
        service.onApplicationBootstrap();

        await handlers.get(OrderDeliveryEditedEvent)?.({ orderId: 7 });

        const params = dataSource.query.mock.calls[0][1] as unknown[];
        expect(params[1]).toBe('7');
        expect(params[3]).toBe(COURIER_WITHOUT_POINT_SKIP_REASON);
        expect(params[4]).toBe(COURIER_POINT_UNCONFIRMED_SKIP_REASON);
        expect(recovery.rebuildSkipped).toHaveBeenCalledWith({}, 11);
    });
});
