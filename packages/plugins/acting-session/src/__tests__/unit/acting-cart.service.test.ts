import { describe, expect, it, vi } from 'vitest';

import { ActingCartService } from '../../acting-cart.service';

function setup(queryResults: unknown[][]) {
    const query = vi.fn();
    for (const rows of queryResults) query.mockResolvedValueOnce(rows);
    const update = vi.fn();
    const orderService = {
        create: vi.fn().mockResolvedValue({ id: 5 }),
        findOne: vi.fn().mockResolvedValue({ id: 5 }),
        deleteOrder: vi.fn(),
    };
    const connection = {
        getRepository: () => ({ query, update }),
        withTransaction: (ctx: unknown, work: (c: unknown) => Promise<unknown>) => work(ctx),
    };
    const service = new ActingCartService(connection as never, orderService as never, {
        storefrontPublicUrl: '',
        cartTtlMs: 1000,
    });
    return { service, query, update, orderService };
}

describe('ActingCartService', () => {
    it('creates the cart linked to the customer user and binds it to the session and administrator', async () => {
        const { service, update, orderService } = setup([]);
        const ctx = { activeUserId: 'user-1' } as never;

        await service.create(ctx, 'sess-1', '7');

        expect(orderService.create).toHaveBeenCalledWith(ctx, 'user-1');
        expect(update).toHaveBeenCalledWith(5, {
            customFields: { actingSessionId: 'sess-1', actingAdministratorId: '7' },
        });
    });

    it('deletes an abandoned cart found stale under its row lock', async () => {
        const { service, orderService, query } = setup([[{ id: '5' }], [{ id: '5' }]]);

        expect(await service.deleteAbandoned({} as never)).toBe(1);

        expect(orderService.deleteOrder).toHaveBeenCalledWith({}, '5');
        expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    });

    it('keeps a cart that was touched or placed between the scan and the lock', async () => {
        const { service, orderService } = setup([[{ id: '5' }], []]);

        expect(await service.deleteAbandoned({} as never)).toBe(0);
        expect(orderService.deleteOrder).not.toHaveBeenCalled();
    });

    it("finds the customer's newest active cart that is not an acting one", async () => {
        const { service, query, orderService } = setup([[{ id: '9' }]]);

        await service.findCustomerCart({ channelId: 1 } as never, 3);

        expect(query.mock.calls[0][0]).toContain('"customFieldsActingsessionid" IS NULL');
        expect(query.mock.calls[0][1]).toEqual([3, 1]);
        expect(orderService.findOne).toHaveBeenCalledWith({ channelId: 1 }, '9');
    });

    it('selects only acting carts, never a customer cart', async () => {
        const { service, query } = setup([[]]);

        await service.deleteAbandoned({} as never);

        expect(query.mock.calls[0][0]).toContain('"customFieldsActingsessionid" IS NOT NULL');
    });
});
