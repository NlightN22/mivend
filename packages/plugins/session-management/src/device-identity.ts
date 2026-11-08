import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

import { labelForUserAgent } from './session.types';

export const DEVICE_COOKIE = 'mv_device';
const COOKIE_MAX_AGE_MS = 400 * 86_400_000;
const issued = new WeakMap<object, string>();

function readCookie(header: string | undefined, name: string): string | undefined {
    const match = header?.split(';').find(part => part.trim().startsWith(`${name}=`));
    return match?.trim().slice(name.length + 1) || undefined;
}

export const ACTING_HEADER = 'x-acting-session';

function startsSession(setCookie: unknown): boolean {
    const values = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
    return values.some(value => String(value).startsWith('session='));
}

// The id is generated up front (so the sign-in request itself can use it) but the cookie is only sent when the
// core's session middleware writes a session cookie (cookie-session runs before this middleware, so we wrap setHeader); acting and API-key traffic never does, so it never receives or reads one.
export function deviceCookieMiddleware(secure: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (
            req.headers[ACTING_HEADER] !== undefined ||
            readCookie(req.headers.cookie, DEVICE_COOKIE)
        ) {
            return next();
        }
        const id = randomBytes(16).toString('hex');
        issued.set(req, id);
        const setHeader = res.setHeader.bind(res) as (name: string, value: unknown) => Response;
        res.setHeader = ((name: string, value: unknown) => {
            if (name.toLowerCase() === 'set-cookie' && startsSession(value)) {
                const flags = `Max-Age=${COOKIE_MAX_AGE_MS / 1000}; Path=/; HttpOnly; SameSite=Lax`;
                const device = `${DEVICE_COOKIE}=${id}; ${flags}${secure || req.secure ? '; Secure' : ''}`;
                const values = Array.isArray(value) ? value : [String(value)];
                return setHeader(name, [...values, device]);
            }
            return setHeader(name, value);
        }) as typeof res.setHeader;
        next();
    };
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export interface DeviceIdentity {
    hash: string;
    label: string;
}

// The id cookie (or the one issued on this very request) identifies the browser; without a request, browser family + OS.
export function deviceIdentityFor(req: Request | undefined): DeviceIdentity {
    const userAgent = req?.headers['user-agent'] ?? null;
    const label = labelForUserAgent(userAgent ? String(userAgent) : null);
    const id =
        (req && (readCookie(req.headers.cookie, DEVICE_COOKIE) ?? issued.get(req))) || undefined;
    return { hash: id ? `c:${sha256(id)}` : `u:${sha256(label)}`, label };
}
