import { describe, expect, it, vi } from 'vitest';
import { EntityNotFoundError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { OrderCancelSerialService } from '../../order-cancel-serial.service';

function build(visible: boolean) {
    const query = vi.fn(async () => []);
    const connection = {
        withTransaction: async (c: unknown, work: (t: unknown) => Promise<unknown>) => work(c),
        getRepository: () => ({
            query,
            findOne: async () => ({ id: '1', state: 'PaymentSettled' }),
        }),
    };
    const orderService = { cancelOrder: vi.fn(async () => ({ id: '1', state: 'Cancelled' })) };
    const qb = { alias: 'o', andWhere: vi.fn(() => qb), getOne: async () => (visible ? {} : null) };
    const visibility = { buildVisibleOrdersQuery: vi.fn(async () => qb) };
    const service = new OrderCancelSerialService(
        connection as never,
        orderService as never,
        visibility as never,
    );
    return { service, orderService, query, qb };
}

describe('OrderCancelSerialService order scope', () => {
    it('refuses an order outside the administrator scope without locking or cancelling', async () => {
        const { service, orderService, query } = build(false);
        await expect(
            service.cancelOrder({} as RequestContext, { orderId: '1' }),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
        expect(orderService.cancelOrder).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });

    it('cancels an order inside the scope through core', async () => {
        const { service, orderService, qb } = build(true);
        await service.cancelOrder({} as RequestContext, { orderId: '1' });
        expect(qb.andWhere).toHaveBeenCalledWith('o.id = :orderId', { orderId: '1' });
        expect(orderService.cancelOrder).toHaveBeenCalledTimes(1);
    });
});
