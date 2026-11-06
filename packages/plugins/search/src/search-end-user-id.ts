import { createHmac } from 'crypto';
import type { RequestContext } from '@vendure/core';

import { SearchOffsetTooLargeError } from './search-errors';

const DEFAULT_MAX_OFFSET = 1900;

// Keyed hash (64 hex chars) of the customer, the anonymous session, or (no session yet) the client IP.
export function searchEndUserId(ctx: RequestContext): string | undefined {
    const secret = process.env.SEARCH_END_USER_ID_SECRET;
    if (!secret) return undefined;
    const subject = ctx.activeUserId
        ? `user:${ctx.activeUserId}`
        : ctx.session?.token
          ? `session:${ctx.session.token}`
          : clientIp(ctx);
    if (!subject) return undefined;
    return createHmac('sha256', secret).update(subject).digest('hex');
}

// First X-Forwarded-For hop (the front proxy appends the real client); spoofable if it does not.
function clientIp(ctx: RequestContext): string | null {
    const req = ctx.req as { headers?: Record<string, unknown>; ip?: string } | undefined;
    const forwarded = req?.headers?.['x-forwarded-for'];
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
    const ip = first || req?.ip;
    return ip ? `ip:${ip}` : null;
}

// Applies to both backends; the external ceiling (2000) must never be reachable by browsing.
export function assertSearchDepth(skip: number | null | undefined): void {
    const raw = Number(process.env.SEARCH_MAX_OFFSET);
    const max = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_OFFSET;
    if ((skip ?? 0) > max) throw new SearchOffsetTooLargeError();
}
