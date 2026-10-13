import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@mivend/ui-kit', () => ({ toast: vi.fn() }));
const shopApi = vi.fn();
vi.mock('../api/client', () => ({ shopApi: (...a: unknown[]) => shopApi(...a) }));

import { useCartStore } from '../stores/cart';
import { useRepeatOrder } from '../pages/orders/useRepeatOrder';

const lines = [
    { quantity: 2, productVariant: { id: 'v1' } },
    { quantity: 1, productVariant: { id: 'v2' } },
];

describe('useRepeatOrder', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        shopApi.mockReset();
    });

    it('adds every line and reports all added', async () => {
        const cart = useCartStore();
        vi.spyOn(cart, 'fetchCart').mockResolvedValue();
        const add = vi.spyOn(cart, 'addItem').mockImplementation(async (id, qty) => {
            cart.order = {
                ...(cart.order ?? {}),
                lines: [
                    ...(cart.order?.lines ?? []),
                    { id, quantity: qty, productVariant: { id } },
                ],
            } as never;
            return null;
        });
        const { repeat } = useRepeatOrder();
        expect(await repeat(lines)).toEqual({ added: 2, skipped: 0 });
        expect(add).toHaveBeenCalledWith('v1', 2);
        expect(add).toHaveBeenCalledWith('v2', 1);
    });

    it('counts a line the cart refused as skipped', async () => {
        const cart = useCartStore();
        vi.spyOn(cart, 'fetchCart').mockResolvedValue();
        vi.spyOn(cart, 'addItem').mockImplementation(async (id, qty) => {
            if (id === 'v1') {
                cart.order = {
                    lines: [{ id, quantity: qty, productVariant: { id } }],
                } as never;
            }
            return null;
        });
        const { repeat, repeating } = useRepeatOrder();
        expect(await repeat(lines)).toEqual({ added: 1, skipped: 1 });
        expect(repeating.value).toBe(false);
    });

    it('stacks onto a line already in the cart', async () => {
        const cart = useCartStore();
        cart.order = { lines: [{ id: 'l', quantity: 5, productVariant: { id: 'v1' } }] } as never;
        vi.spyOn(cart, 'fetchCart').mockResolvedValue();
        vi.spyOn(cart, 'addItem').mockImplementation(async () => {
            cart.order = {
                lines: [{ id: 'l', quantity: 7, productVariant: { id: 'v1' } }],
            } as never;
            return null;
        });
        const { repeat } = useRepeatOrder();
        expect(await repeat([lines[0]])).toEqual({ added: 1, skipped: 0 });
    });
});
