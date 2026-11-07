import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminApi = vi.fn();
const hasPermission = vi.fn();
vi.mock('../../api/client', () => ({ adminApi: (...a: unknown[]) => adminApi(...a) }));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => ({ hasPermission }) }));

import { useActAsCustomer } from '../../composables/useActAsCustomer';

describe('useActAsCustomer', () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.fn();

    beforeEach(() => {
        adminApi.mockReset();
        hasPermission.mockReset();
        tab.location.href = '';
        tab.close.mockReset();
        open.mockReset().mockReturnValue(tab);
        vi.stubGlobal('window', { open });
    });

    it('is allowed only with the CreateOrder permission, the one the server checks', () => {
        hasPermission.mockImplementation((p: string) => p === 'CreateOrder');
        expect(useActAsCustomer(() => '1').allowed.value).toBe(true);
        hasPermission.mockReturnValue(false);
        expect(useActAsCustomer(() => '1').allowed.value).toBe(false);
    });

    it('starts for this counterparty with no trading point and opens the storefront ticket url', async () => {
        adminApi.mockResolvedValue({
            startActingSession: {
                ticket: 'a b',
                storefrontUrl: 'https://shop.test/',
                expiresAt: 'x',
            },
        });
        const c = useActAsCustomer(() => '42');
        const pending = c.start();
        expect(c.starting.value).toBe(true);
        await pending;
        expect(adminApi.mock.calls[0][1]).toEqual({ counterpartyId: '42', tradingPointId: null });
        expect(tab.location.href).toBe('https://shop.test/acting#ticket=a%20b');
        expect(c.starting.value).toBe(false);
        expect(c.error.value).toBe('');
    });

    it('shows the server refusal, closes the blank tab and re-enables the button', async () => {
        adminApi.mockRejectedValue(new Error('Customer has no portal access'));
        const c = useActAsCustomer(() => '42');
        await c.start();
        expect(c.error.value).toBe('Customer has no portal access');
        expect(tab.close).toHaveBeenCalledOnce();
        expect(tab.location.href).toBe('');
        expect(c.starting.value).toBe(false);
    });
});
