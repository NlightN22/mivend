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

interface SessionState {
    isNew?: boolean;
    isPopulated?: boolean;
    isChanged?: boolean;
}

// Same predicate cookie-session uses (on-headers, at write time) to decide that it emits the session cookie.
function sessionCookieWillBeWritten(session: unknown): boolean {
    const state = session as SessionState | null | undefined;
    return (
        !!state &&
        typeof state === 'object' &&
        (!state.isNew || !!state.isPopulated) &&
        !!state.isChanged
    );
}

// cookie-session emits its cookie inside the response head write and keeps no handle we could wrap, so we decide
// with its own predicate just before that write (our wrapper runs first) and add the cookie then; it appends to
// the header we set. The id is generated up front so the sign-in request itself can use it. Acting traffic is skipped.
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
        const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => Response;
        res.writeHead = ((...args: unknown[]) => {
            if (!res.headersSent && sessionCookieWillBeWritten(req.session)) {
                const flags = `Max-Age=${COOKIE_MAX_AGE_MS / 1000}; Path=/; HttpOnly; SameSite=Lax`;
                const device = `${DEVICE_COOKIE}=${id}; ${flags}${secure || req.secure ? '; Secure' : ''}`;
                const existing = res.getHeader('Set-Cookie');
                const values = Array.isArray(existing)
                    ? existing
                    : existing
                      ? [String(existing)]
                      : [];
                res.setHeader('Set-Cookie', [...values, device]);
            }
            return writeHead(...args);
        }) as typeof res.writeHead;
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
