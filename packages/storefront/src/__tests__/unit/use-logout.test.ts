import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    acting: false,
    finish: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    managerUrl: 'https://manager.example' as string | null,
}));
vi.mock('../../stores/acting', () => ({
    useActingStore: () => ({
        get isActing() {
            return state.acting;
        },
        finish: state.finish,
    }),
}));
vi.mock('../../stores/auth', () => ({
    LOGGED_OUT_KEY: 'mv_logged_out',
    useAuthStore: () => ({ logout: state.logout }),
}));
vi.mock('../../utils/managerUrl', () => ({ readManagerUrl: () => state.managerUrl }));

import { useLogout } from '../../composables/useLogout';

describe('useLogout', () => {
    const win = { close: vi.fn(), location: { href: '' } };

    beforeEach(() => {
        state.acting = false;
        state.finish.mockClear();
        state.logout.mockClear();
        state.managerUrl = 'https://manager.example';
        win.close.mockClear();
        win.location.href = '';
        vi.stubGlobal('window', win);
        vi.stubGlobal('sessionStorage', { setItem: vi.fn() });
    });

    it('signs a customer out and goes to the login page', async () => {
        await useLogout()();
        expect(state.logout).toHaveBeenCalledTimes(1);
        expect(state.finish).not.toHaveBeenCalled();
        expect(win.close).not.toHaveBeenCalled();
        expect(win.location.href).toBe('/login');
    });

    it('ends the acting session instead and returns to the manager portal', async () => {
        state.acting = true;
        await useLogout()();
        expect(state.finish).toHaveBeenCalledTimes(1);
        expect(state.logout).not.toHaveBeenCalled();
        expect(win.close).toHaveBeenCalledTimes(1);
        expect(win.location.href).toBe('https://manager.example');
    });

    it('falls back to the login page when the manager portal address is unknown', async () => {
        state.acting = true;
        state.managerUrl = null;
        await useLogout()();
        expect(win.location.href).toBe('/login');
    });
});
