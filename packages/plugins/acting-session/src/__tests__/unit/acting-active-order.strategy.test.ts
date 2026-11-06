import { describe, expect, it, vi } from 'vitest';

import { ActingActiveOrderStrategy } from '../../acting-active-order.strategy';

function setup(acting: unknown) {
    const inner = {
        name: 'default',
        determineActiveOrder: vi.fn().mockResolvedValue({ id: 'customer-cart' }),
        createActiveOrder: vi.fn().mockResolvedValue({ id: 'new-customer-cart' }),
    };
    const carts = {
        find: vi.fn().mockResolvedValue({ id: 'acting-cart' }),
        create: vi.fn().mockResolvedValue({ id: 'new-acting-cart' }),
        findCustomerCart: vi.fn().mockResolvedValue({ id: 'own-cart' }),
    };
    const sessions = { unsetActiveOrder: vi.fn() };
    const strategy = new ActingActiveOrderStrategy(inner as never);
    void strategy.init({
        get: (token: { name: string }) =>
            token.name === 'ActingContextService'
                ? { get: async () => acting }
                : token.name === 'SessionService'
                  ? sessions
                  : carts,
    } as never);
    return { strategy, inner, carts, sessions };
}

const ctx = { session: { id: 'sess-1' } } as never;

describe('ActingActiveOrderStrategy', () => {
    it("serves an acting session its own cart and never the customer's", async () => {
        const { strategy, inner, carts } = setup({ administratorId: '7', tradingPointId: null });

        expect(await strategy.determineActiveOrder(ctx, {})).toEqual({ id: 'acting-cart' });
        expect(await strategy.createActiveOrder(ctx, {})).toEqual({ id: 'new-acting-cart' });

        expect(carts.find).toHaveBeenCalledWith(ctx, 'sess-1');
        expect(carts.create).toHaveBeenCalledWith(ctx, 'sess-1', '7');
        expect(inner.determineActiveOrder).not.toHaveBeenCalled();
        expect(inner.createActiveOrder).not.toHaveBeenCalled();
    });

    it("returns no cart (not the customer's) when the acting session has none yet", async () => {
        const { strategy, carts } = setup({ administratorId: '7', tradingPointId: null });
        carts.find.mockResolvedValue(undefined);

        expect(await strategy.determineActiveOrder(ctx, {})).toBeUndefined();
    });

    it('delegates an ordinary session to the wrapped strategy', async () => {
        const { strategy, inner, carts } = setup(null);

        expect(await strategy.determineActiveOrder(ctx, {})).toEqual({ id: 'customer-cart' });
        expect(await strategy.createActiveOrder(ctx, {})).toEqual({ id: 'new-customer-cart' });
        expect(carts.find).not.toHaveBeenCalled();
        expect(inner.determineActiveOrder).toHaveBeenCalled();
    });

    it("replaces an acting cart picked up by a real session with the customer's own cart", async () => {
        const { strategy, inner, carts, sessions } = setup(null);
        inner.determineActiveOrder.mockResolvedValue({
            id: 'acting-cart',
            customerId: 3,
            customFields: { actingSessionId: 'other' },
        });

        expect(await strategy.determineActiveOrder(ctx, {})).toEqual({ id: 'own-cart' });
        expect(sessions.unsetActiveOrder).toHaveBeenCalledWith(
            ctx,
            (ctx as never as { session: unknown }).session,
        );
        expect(carts.findCustomerCart).toHaveBeenCalledWith(ctx, 3);
    });

    it('returns no cart to a real session whose only cart is an acting one', async () => {
        const { strategy, inner, carts } = setup(null);
        inner.determineActiveOrder.mockResolvedValue({
            id: 'acting-cart',
            customerId: 3,
            customFields: { actingSessionId: 'other' },
        });
        carts.findCustomerCart.mockResolvedValue(undefined);

        expect(await strategy.determineActiveOrder(ctx, {})).toBeUndefined();
    });
});
