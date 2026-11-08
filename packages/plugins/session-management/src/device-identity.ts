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

// Gives every browser a random id before any resolver runs, so the id is on the sign-in request itself.
export function deviceCookieMiddleware(req: Request, res: Response, next: NextFunction): void {
    const existing = readCookie(req.headers.cookie, DEVICE_COOKIE);
    if (!existing) {
        const id = randomBytes(16).toString('hex');
        issued.set(req, id);
        res.cookie(DEVICE_COOKIE, id, {
            httpOnly: true,
            sameSite: 'lax',
            secure: req.secure,
            maxAge: COOKIE_MAX_AGE_MS,
        });
    }
    next();
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
