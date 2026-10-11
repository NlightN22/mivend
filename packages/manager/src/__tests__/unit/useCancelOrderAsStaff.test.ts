import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminApi = vi.fn();
const hasPermission = vi.fn();
vi.mock('../../api/client', () => ({ adminApi: (...a: unknown[]) => adminApi(...a) }));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => ({ hasPermission }) }));

import { useCancelOrderAsStaff } from '../../composables/useCancelOrderAsStaff';

describe('useCancelOrderAsStaff', () => {
    beforeEach(() => {
        adminApi.mockReset();
        hasPermission.mockReset();
    });

    it('is allowed only with the CancelOrder permission', () => {
        hasPermission.mockImplementation((p: string) => p === 'CancelOrder');
        expect(useCancelOrderAsStaff(() => '1', vi.fn()).allowed.value).toBe(true);
        hasPermission.mockReturnValue(false);
        expect(useCancelOrderAsStaff(() => '1', vi.fn()).allowed.value).toBe(false);
    });

    it('reloads on success', async () => {
        adminApi.mockResolvedValue({ cancelOrderAsStaff: { outcome: 'CANCELLED' } });
        const reload = vi.fn();
        const c = useCancelOrderAsStaff(() => '7', reload);
        expect(await c.cancel()).toBe(true);
        expect(adminApi.mock.calls[0][1]).toEqual({ orderId: '7' });
        expect(reload).toHaveBeenCalledOnce();
    });

    it('maps a refusal to text without reloading', async () => {
        adminApi.mockResolvedValue({ cancelOrderAsStaff: { reason: 'PAID', message: 'm' } });
        const reload = vi.fn();
        const c = useCancelOrderAsStaff(() => '7', reload);
        expect(await c.cancel()).toBe(false);
        expect(c.error.value).toMatch(/paid/);
        expect(reload).not.toHaveBeenCalled();
    });

    it('reports a transport failure', async () => {
        adminApi.mockRejectedValueOnce(new Error('down'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const c = useCancelOrderAsStaff(() => '7', vi.fn());
        expect(await c.cancel()).toBe(false);
        expect(c.error.value).toMatch(/Failed/);
    });
});
