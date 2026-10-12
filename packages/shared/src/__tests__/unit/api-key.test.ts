import { describe, expect, it, vi, afterEach } from 'vitest';

const timingSafeEqualSpy = vi.hoisted(() => vi.fn());
vi.mock('node:crypto', async importOriginal => {
    const actual = await importOriginal<typeof import('node:crypto')>();
    timingSafeEqualSpy.mockImplementation(actual.timingSafeEqual);
    return { ...actual, timingSafeEqual: timingSafeEqualSpy };
});

import { isRestSurfaceEnabled, verifyApiKey } from '../../api-key';

const KEY = 'local-test-key-0123456789';

afterEach(() => {
    timingSafeEqualSpy.mockClear();
    vi.unstubAllEnvs();
});

describe('verifyApiKey', () => {
    it('refuses everything when no key is configured', () => {
        expect(verifyApiKey({ 'x-api-key': KEY }, undefined)).toBe(false);
        expect(verifyApiKey({ 'x-api-key': '' }, '')).toBe(false);
    });

    it('refuses a configured key shorter than 16 characters even if it matches', () => {
        expect(verifyApiKey({ 'x-api-key': 'short' }, 'short')).toBe(false);
    });

    it('refuses a rejected literal value', () => {
        expect(
            verifyApiKey({ 'x-api-key': 'dev-token-dev-token' }, 'dev-token-dev-token', {
                rejectValues: ['dev-token-dev-token'],
            }),
        ).toBe(false);
    });

    it('refuses a wrong key and a missing header', () => {
        expect(verifyApiKey({ 'x-api-key': `${KEY}x` }, KEY)).toBe(false);
        expect(verifyApiKey({}, KEY)).toBe(false);
    });

    it('accepts the right key via X-Api-Key and via Authorization: Bearer', () => {
        expect(verifyApiKey({ 'x-api-key': KEY }, KEY)).toBe(true);
        expect(verifyApiKey({ authorization: `Bearer ${KEY}` }, KEY)).toBe(true);
    });

    it('does not throw on a length mismatch and compares via timingSafeEqual', () => {
        expect(() => verifyApiKey({ 'x-api-key': 'a' }, KEY)).not.toThrow();
        expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1);
    });
});

describe('isRestSurfaceEnabled', () => {
    it('is off unless the flag is exactly "true"', () => {
        vi.stubEnv('F', '1');
        expect(isRestSurfaceEnabled('F', 'K')).toBe(false);
    });

    it('stays mounted but logs an error when the key is unusable', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.stubEnv('F', 'true');
        vi.stubEnv('K', 'sekret1');
        expect(isRestSurfaceEnabled('F', 'K')).toBe(true);
        expect(err).toHaveBeenCalledOnce();
        expect(String(err.mock.calls[0][0])).not.toContain('sekret1');
        err.mockRestore();
    });
});
