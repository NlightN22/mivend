import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { ActingSessionMiddleware, bearerToken } from '../../acting-session.middleware';

function run(headers: Record<string, string>, endDeadSession = vi.fn().mockResolvedValue(0)) {
    const middleware = new ActingSessionMiddleware(
        { endDeadSession } as never,
        { create: vi.fn().mockResolvedValue({}) } as never,
        { storefrontPublicUrl: '', sessionTtlMs: 1000 },
    );
    const req = { headers: { ...headers } } as unknown as Request;
    const done = new Promise<unknown>(resolve => middleware.use(req, {} as Response, resolve));
    return { req, done, endDeadSession };
}

describe('ActingSessionMiddleware', () => {
    it('drops the cookie of an acting request so the customer cookie is never read or rewritten', async () => {
        const { req, done } = run({ 'x-acting-session': '1', cookie: 'session=real-customer' });
        await done;
        expect(req.headers.cookie).toBeUndefined();
    });

    it('leaves the cookie of an ordinary storefront request untouched', async () => {
        const { req, done, endDeadSession } = run({ cookie: 'session=real-customer' });
        await done;
        expect(req.headers.cookie).toBe('session=real-customer');
        expect(endDeadSession).not.toHaveBeenCalled();
    });

    it('checks the liveness of a bearer token and lets the request on', async () => {
        const { done, endDeadSession } = run({ authorization: 'Bearer abc' });
        expect(await done).toBeUndefined();
        expect(endDeadSession).toHaveBeenCalledWith({}, 'abc', 1000);
    });

    it('passes a liveness failure to the error handler instead of swallowing it', async () => {
        const failure = new Error('db down');
        const { done } = run({ authorization: 'Bearer abc' }, vi.fn().mockRejectedValue(failure));
        expect(await done).toBe(failure);
    });

    it('extracts only well-formed bearer tokens', () => {
        expect(bearerToken('Bearer xyz')).toBe('xyz');
        expect(bearerToken('Basic xyz')).toBeUndefined();
        expect(bearerToken(undefined)).toBeUndefined();
    });
});
