import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ acting: false, blocking: true, load: vi.fn() }));

vi.mock('../stores/acting', () => ({ useActingStore: () => ({ isActing: state.acting }) }));
vi.mock('../stores/auth', () => ({
    useAuthStore: () => ({ authStatus: 'authenticated', customer: { id: '5' } }),
}));
vi.mock('../stores/legal', () => ({
    useLegalStore: () => ({ loadedFor: null, blocking: state.blocking, load: state.load }),
}));

import { legalRedirect } from '../router/legalGate';

describe('legalRedirect', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        state.acting = false;
        state.blocking = true;
        state.load.mockReset();
    });

    it('sends a customer with an unanswered required document to the consent screen', async () => {
        expect(await legalRedirect('/orders', '/orders?x=1')).toEqual({
            path: '/legal-consent',
            query: { redirect: '/orders?x=1' },
        });
    });

    it('never asks a manager acting for the customer', async () => {
        state.acting = true;
        expect(await legalRedirect('/orders', '/orders')).toBeNull();
        expect(state.load).not.toHaveBeenCalled();
    });

    it('lets public documents and the login screen through', async () => {
        expect(await legalRedirect('/legal/policy', '/legal/policy')).toBeNull();
        expect(await legalRedirect('/login', '/login')).toBeNull();
    });

    it('lets navigation proceed when the status cannot be read', async () => {
        state.load.mockRejectedValue(new Error('down'));
        expect(await legalRedirect('/orders', '/orders')).toBeNull();
    });
});
