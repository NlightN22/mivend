import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

const adminApi = vi.fn();
const confirmOrder = vi.fn();
const hasPermission = vi.fn();
vi.mock('../../api/client', () => ({ adminApi: (...a: unknown[]) => adminApi(...a) }));
vi.mock('../../api/reservation', () => ({
    confirmOrder: (...a: unknown[]) => confirmOrder(...a),
}));
vi.mock('../../api/orderChecks', () => ({ fetchOrderChecks: vi.fn().mockResolvedValue([]) }));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => ({ hasPermission }) }));

import { useOrderDecision } from '../../composables/useOrderDecision';

function order(over: Record<string, unknown> = {}) {
    return {
        visibleOrders: {
            items: [
                {
                    id: '7',
                    state: 'ArrangingPayment',
                    cancellable: true,
                    customFields: { reservationState: 'AWAITING_CONFIRMATION', reservationDays: 5 },
                    ...over,
                },
            ],
        },
    };
}

describe('useOrderDecision', () => {
    beforeEach(() => {
        adminApi.mockReset();
        confirmOrder.mockReset();
        hasPermission.mockReset();
        hasPermission.mockReturnValue(true);
    });

    it('prefills the order default days and offers both actions', async () => {
        adminApi.mockResolvedValue(order());
        const d = useOrderDecision(() => '7', vi.fn());
        await flushPromises();
        expect(d.days.value).toBe('5');
        expect(d.canConfirm.value).toBe(true);
        expect(d.canReject.value).toBe(true);
    });

    it('offers nothing without the permissions', async () => {
        hasPermission.mockReturnValue(false);
        adminApi.mockResolvedValue(order());
        const d = useOrderDecision(() => '7', vi.fn());
        await flushPromises();
        expect(d.canConfirm.value).toBe(false);
        expect(d.canReject.value).toBe(false);
    });

    it('confirms with the entered days and notifies', async () => {
        adminApi.mockResolvedValue(order());
        confirmOrder.mockResolvedValue([]);
        const done = vi.fn();
        const d = useOrderDecision(() => '7', done);
        await flushPromises();
        d.days.value = '9';
        expect(await d.confirm()).toBe(true);
        expect(confirmOrder).toHaveBeenCalledWith('7', 9);
        expect(done).toHaveBeenCalledOnce();
    });

    it('rejects a non-positive period without calling the server', async () => {
        adminApi.mockResolvedValue(order());
        const d = useOrderDecision(() => '7', vi.fn());
        await flushPromises();
        d.days.value = '0';
        expect(await d.confirm()).toBe(false);
        expect(confirmOrder).not.toHaveBeenCalled();
        expect(d.confirmError.value).toMatch(/positive/);
    });

    it('shows the server error and does not notify when confirm fails', async () => {
        adminApi.mockResolvedValue(order());
        confirmOrder.mockRejectedValue(new Error('Not enough stock'));
        const done = vi.fn();
        const d = useOrderDecision(() => '7', done);
        await flushPromises();
        expect(await d.confirm()).toBe(false);
        expect(d.confirmError.value).toBe('Not enough stock');
        expect(done).not.toHaveBeenCalled();
    });

    it('reports a load failure instead of hiding it', async () => {
        adminApi.mockRejectedValue(new Error('boom'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const d = useOrderDecision(() => '7', vi.fn());
        await flushPromises();
        expect(d.loadError.value).toMatch(/Could not load/);
        expect(d.canConfirm.value).toBe(false);
    });
});
