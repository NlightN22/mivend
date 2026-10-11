import { beforeEach, describe, expect, it, vi } from 'vitest';

const shopApi = vi.fn();
vi.mock('../api/client', () => ({ shopApi: (...a: unknown[]) => shopApi(...a) }));

import { useCancelOrder } from '../pages/orders/useCancelOrder';

describe('canCancel', () => {
    it.each([
        [true, true],
        [false, false],
        [undefined, false],
    ])('follows the server flag %s', (flag, expected) => {
        expect(
            useCancelOrder(
                () => '100',
                () => flag,
                vi.fn(),
            ).canCancel.value,
        ).toBe(expected);
    });
});

describe('useCancelOrder', () => {
    beforeEach(() => shopApi.mockReset());

    it('refreshes the order on success', async () => {
        shopApi.mockResolvedValue({ cancelOrder: { outcome: 'CANCELLED' } });
        const refresh = vi.fn();
        const c = useCancelOrder(
            () => '100',
            () => true,
            refresh,
        );
        expect(await c.cancel()).toBe(true);
        expect(refresh).toHaveBeenCalledOnce();
        expect(c.refusalReason.value).toBeNull();
    });

    it('exposes the refusal reason without refreshing', async () => {
        shopApi.mockResolvedValue({ cancelOrder: { reason: 'PAID', message: 'x' } });
        const refresh = vi.fn();
        const c = useCancelOrder(
            () => '100',
            () => true,
            refresh,
        );
        expect(await c.cancel()).toBe(false);
        expect(c.refusalReason.value).toBe('PAID');
        expect(refresh).not.toHaveBeenCalled();
    });

    it('flags a transport failure', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        shopApi.mockRejectedValueOnce(new Error('down'));
        const c = useCancelOrder(
            () => '100',
            () => true,
            vi.fn(),
        );
        expect(await c.cancel()).toBe(false);
        expect(c.failed.value).toBe(true);
        expect(c.cancelling.value).toBe(false);
    });
});
