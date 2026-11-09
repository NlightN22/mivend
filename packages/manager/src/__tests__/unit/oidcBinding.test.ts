import { beforeEach, describe, expect, it, vi } from 'vitest';

import { consumeOidcState, rememberOidcState } from '../../composables/oidcBinding';

beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
    });
});

describe('OIDC browser binding', () => {
    it('accepts the state this browser started, once', () => {
        rememberOidcState('https://idp.example.com/auth?state=abc&nonce=n');
        expect(consumeOidcState('abc')).toBe(true);
        expect(consumeOidcState('abc')).toBe(false);
    });

    it('refuses a callback opened without a stored state', () => {
        expect(consumeOidcState('abc')).toBe(false);
    });

    it('refuses a different state and drops the stored one', () => {
        rememberOidcState('https://idp.example.com/auth?state=abc');
        expect(consumeOidcState('other')).toBe(false);
        expect(consumeOidcState('abc')).toBe(false);
    });

    it('fails closed when storage throws', () => {
        vi.stubGlobal('sessionStorage', {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
            removeItem: () => {},
        });
        expect(() => rememberOidcState('https://idp.example.com/auth?state=abc')).not.toThrow();
        expect(consumeOidcState('abc')).toBe(false);
    });
});
