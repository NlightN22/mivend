import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { deviceCookieMiddleware } from '../../device-identity';

function run(secure: boolean, reqSecure: boolean): { cookie: ReturnType<typeof vi.fn> } {
    const cookie = vi.fn();
    deviceCookieMiddleware(secure)(
        { headers: {}, secure: reqSecure } as unknown as Request,
        { cookie } as unknown as Response,
        vi.fn(),
    );
    return { cookie };
}

describe('deviceCookieMiddleware', () => {
    it('is Secure when configured, even if the proxy-terminated request looks plain', () => {
        expect(run(true, false).cookie.mock.calls[0][2]).toMatchObject({
            secure: true,
            httpOnly: true,
        });
    });

    it('is not Secure on plain local http', () => {
        expect(run(false, false).cookie.mock.calls[0][2]).toMatchObject({ secure: false });
    });

    it('does not reissue when the cookie is present', () => {
        const cookie = vi.fn();
        deviceCookieMiddleware(true)(
            { headers: { cookie: 'mv_device=abc' } } as unknown as Request,
            { cookie } as unknown as Response,
            vi.fn(),
        );
        expect(cookie).not.toHaveBeenCalled();
    });
});
