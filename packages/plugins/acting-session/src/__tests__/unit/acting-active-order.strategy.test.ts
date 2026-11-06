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
    };
    const strategy = new ActingActiveOrderStrategy(inner as never);
    void strategy.init({
        get: (token: { name: string }) =>
            token.name === 'ActingContextService' ? { get: async () => acting } : carts,
    } as never);
    return { strategy, inner, carts };
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
});
