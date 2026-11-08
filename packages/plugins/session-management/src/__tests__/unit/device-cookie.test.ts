import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { deviceCookieMiddleware } from '../../device-identity';

function respond(headers: Record<string, string>, secure = false) {
    const inner = vi.fn();
    const res = { setHeader: inner } as unknown as Response;
    const next = vi.fn();
    deviceCookieMiddleware(secure)({ headers, secure: false } as unknown as Request, res, next);
    return { res, next, inner };
}

describe('deviceCookieMiddleware', () => {
    it('adds the device cookie to the response that starts a session, Secure when configured', () => {
        const { res, next, inner } = respond({}, true);
        res.setHeader('Set-Cookie', ['session=abc; path=/']);
        const sent = inner.mock.calls[0][1] as string[];
        expect(sent[0]).toBe('session=abc; path=/');
        expect(sent[1]).toMatch(/^mv_device=[0-9a-f]{32}; .*HttpOnly.*SameSite=Lax; Secure$/);
        expect(next).toHaveBeenCalled();
    });

    it('adds nothing to other headers or responses that start no session', () => {
        const { res, inner } = respond({});
        res.setHeader('Set-Cookie', ['other=1']);
        res.setHeader('X-Test', 'a');
        expect(inner.mock.calls[0][1]).toEqual(['other=1']);
        expect(inner.mock.calls[1][1]).toBe('a');
    });

    it('never touches acting traffic, even when a session cookie is written', () => {
        const { res, next, inner } = respond({ 'x-acting-session': '1' });
        expect(res.setHeader).toBe(inner);
        expect(next).toHaveBeenCalled();
    });

    it('does not reissue when the cookie is present', () => {
        const { res, inner } = respond({ cookie: 'mv_device=abc' });
        expect(res.setHeader).toBe(inner);
    });
});
