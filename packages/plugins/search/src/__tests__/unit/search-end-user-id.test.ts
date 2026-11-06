import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { assertSearchDepth, searchEndUserId } from '../../search-end-user-id';

const ctx = (activeUserId: unknown, token?: string): RequestContext =>
    ({ activeUserId, session: token ? { token } : undefined }) as unknown as RequestContext;

describe('searchEndUserId', () => {
    beforeEach(() => {
        process.env.SEARCH_END_USER_ID_SECRET = 'secret';
    });
    afterEach(() => {
        delete process.env.SEARCH_END_USER_ID_SECRET;
        delete process.env.SEARCH_MAX_OFFSET;
    });

    it('is a stable hex digest within the allowed charset, without the raw id', () => {
        const id = searchEndUserId(ctx(42));
        expect(id).toMatch(/^[a-f0-9]{64}$/);
        expect(id).toBe(searchEndUserId(ctx(42)));
        expect(id).not.toContain('42');
        expect(searchEndUserId(ctx(43))).not.toBe(id);
    });

    it('gives a guest a stable id from the anonymous session', () => {
        const id = searchEndUserId(ctx(undefined, 'tok-1'));
        expect(id).toBe(searchEndUserId(ctx(undefined, 'tok-1')));
        expect(id).not.toBe(searchEndUserId(ctx(undefined, 'tok-2')));
    });

    it('falls back to the first forwarded IP for a request without a session', () => {
        const req = (xff: string | undefined, ip = '10.0.0.1'): RequestContext =>
            ({
                activeUserId: undefined,
                req: { headers: { 'x-forwarded-for': xff }, ip },
            }) as never;
        const id = searchEndUserId(req('203.0.113.5, 10.0.0.9'));
        expect(id).toMatch(/^[a-f0-9]{64}$/);
        expect(id).toBe(searchEndUserId(req('203.0.113.5')));
        expect(id).not.toBe(searchEndUserId(req('203.0.113.6')));
        expect(searchEndUserId(req(undefined, '198.51.100.1'))).toMatch(/^[a-f0-9]{64}$/);
    });

    it('depends on the secret and is omitted without one or without a subject', () => {
        const withSecret = searchEndUserId(ctx(1));
        process.env.SEARCH_END_USER_ID_SECRET = 'other';
        expect(searchEndUserId(ctx(1))).not.toBe(withSecret);
        expect(searchEndUserId(ctx(undefined))).toBeUndefined();
        delete process.env.SEARCH_END_USER_ID_SECRET;
        expect(searchEndUserId(ctx(1))).toBeUndefined();
    });

    it('caps pagination depth, configurable', () => {
        expect(() => assertSearchDepth(1900)).not.toThrow();
        expect(() => assertSearchDepth(1901)).toThrow(/refine/);
        process.env.SEARCH_MAX_OFFSET = '100';
        expect(() => assertSearchDepth(101)).toThrow(/refine/);
        expect(() => assertSearchDepth(undefined)).not.toThrow();
    });
});
