import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { shopApi } from '../../api/client';
import { actingHeaders, readActingSession, saveActingSession } from '../../api/actingToken';
import { useActingStore } from '../../stores/acting';
import { captureActingTicket, takeActingTicket } from '../../utils/actingTicket';
import { managerOrderUrl, readManagerUrl } from '../../utils/managerUrl';

function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
        getItem: k => data.get(k) ?? null,
        setItem: (k, v) => void data.set(k, String(v)),
        removeItem: k => void data.delete(k),
        clear: () => data.clear(),
        key: i => [...data.keys()][i] ?? null,
        get length() {
            return data.size;
        },
    };
}

function ok(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: body }),
    } as unknown as Response;
}

describe('acting ticket capture', () => {
    it('reads the fragment ticket and removes it from the address bar', () => {
        const hist = { state: null, replaceState: vi.fn() } as unknown as History;
        captureActingTicket(
            { pathname: '/acting', hash: '#ticket=abc', search: '' } as Location,
            hist,
        );
        expect(hist.replaceState).toHaveBeenCalledWith(null, '', '/acting');
        expect(takeActingTicket()).toBe('abc');
        expect(takeActingTicket()).toBeNull();
    });

    it('ignores a query-string ticket and other paths', () => {
        const hist = { state: null, replaceState: vi.fn() } as unknown as History;
        captureActingTicket(
            { pathname: '/acting', hash: '', search: '?ticket=q1' } as Location,
            hist,
        );
        expect(takeActingTicket()).toBeNull();
        captureActingTicket(
            { pathname: '/catalog', hash: '#ticket=x', search: '' } as Location,
            hist,
        );
        expect(hist.replaceState).toHaveBeenCalledTimes(1);
        expect(takeActingTicket()).toBeNull();
    });
});

describe('acting token transport', () => {
    beforeEach(() => {
        vi.stubGlobal('sessionStorage', memoryStorage());
        vi.stubGlobal('localStorage', memoryStorage());
        setActivePinia(createPinia());
    });

    it('sends no acting headers without a token and keeps the cookie', async () => {
        const fetchMock = vi.fn().mockResolvedValue(ok({}));
        vi.stubGlobal('fetch', fetchMock);
        await shopApi('{ a }');
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(init.credentials).toBe('include');
    });

    it('sends bearer and marker header, without cookie, once exchanged; stores only in sessionStorage', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(ok({ exchangeActingTicket: { token: 't1', expiresAt: 'e' } }))
            .mockResolvedValue(ok({}));
        vi.stubGlobal('fetch', fetchMock);
        await useActingStore().exchange('ticket');
        await shopApi('{ a }');
        const init = fetchMock.mock.calls[1][1] as RequestInit;
        expect(init.headers).toMatchObject({ Authorization: 'Bearer t1', 'x-acting-session': '1' });
        expect(init.credentials).toBe('omit');
        expect(localStorage.length).toBe(0);
    });

    it('finish clears the token even when the server call fails', async () => {
        saveActingSession({ token: 't', expiresAt: 'e' });
        setActivePinia(createPinia());
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')));
        vi.useFakeTimers();
        const done = useActingStore()
            .finish()
            .catch(() => undefined);
        await vi.runAllTimersAsync();
        await done;
        vi.useRealTimers();
        expect(readActingSession()).toBeNull();
        expect(actingHeaders()).toEqual({});
    });

    it('two tabs (separate sessionStorage) keep independent customers', () => {
        const tabA = memoryStorage();
        const tabB = memoryStorage();
        vi.stubGlobal('sessionStorage', tabA);
        saveActingSession({ token: 'customer-a', expiresAt: 'e' });
        vi.stubGlobal('sessionStorage', tabB);
        saveActingSession({ token: 'customer-b', expiresAt: 'e' });
        expect(readActingSession()?.token).toBe('customer-b');
        vi.stubGlobal('sessionStorage', tabA);
        expect(readActingSession()?.token).toBe('customer-a');
    });
});

describe('manager url', () => {
    const doc = (content: string) =>
        ({ querySelector: () => ({ getAttribute: () => content }) }) as unknown as Document;

    it('builds the order link from the configured base', () => {
        expect(readManagerUrl(doc('https://m.example.org/'))).toBe('https://m.example.org');
        expect(managerOrderUrl('1001', 'https://m.example.org')).toBe(
            'https://m.example.org/orders/1001',
        );
    });

    it('has no link when unconfigured', () => {
        expect(managerOrderUrl('1001', null)).toBeNull();
    });
});
