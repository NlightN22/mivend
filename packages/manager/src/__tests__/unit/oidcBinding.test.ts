import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { consumeOidcState, rememberOidcState } from '../../composables/oidcBinding';

function stubStorage(): Map<string, string> {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
        key: (i: number) => [...data.keys()][i] ?? null,
        get length() {
            return data.size;
        },
    });
    return data;
}

let data: Map<string, string>;
beforeEach(() => {
    vi.useFakeTimers();
    data = stubStorage();
});
afterEach(() => vi.useRealTimers());

describe('OIDC browser binding', () => {
    it('accepts the state this browser started, once', () => {
        rememberOidcState('https://idp.example.com/auth?state=abc&nonce=n');
        expect(consumeOidcState('abc')).toBe(true);
        expect(consumeOidcState('abc')).toBe(false);
    });

    it('accepts the callback from another tab of the same browser', () => {
        rememberOidcState('https://idp.example.com/auth?state=abc');
        vi.stubGlobal('sessionStorage', undefined);
        expect(consumeOidcState('abc')).toBe(true);
    });

    it('refuses a callback opened without a stored state', () => {
        expect(consumeOidcState('abc')).toBe(false);
        expect(consumeOidcState('')).toBe(false);
    });

    it('refuses a different state and keeps the pending one', () => {
        rememberOidcState('https://idp.example.com/auth?state=abc');
        expect(consumeOidcState('other')).toBe(false);
        expect(consumeOidcState('abc')).toBe(true);
    });

    it('refuses a state older than ten minutes and drops expired ones on the next start', () => {
        rememberOidcState('https://idp.example.com/auth?state=old');
        vi.advanceTimersByTime(10 * 60 * 1000 + 1);
        rememberOidcState('https://idp.example.com/auth?state=new');
        expect(data.size).toBe(1);
        expect(consumeOidcState('old')).toBe(false);
        expect(consumeOidcState('new')).toBe(true);
    });

    it('fails closed when storage throws', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
            removeItem: () => {},
            key: () => null,
            length: 0,
        });
        expect(() => rememberOidcState('https://idp.example.com/auth?state=abc')).not.toThrow();
        expect(consumeOidcState('abc')).toBe(false);
    });
});
