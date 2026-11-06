import { createHmac } from 'crypto';
import type { RequestContext } from '@vendure/core';

import { SearchOffsetTooLargeError } from './search-errors';

const DEFAULT_MAX_OFFSET = 1900;
const DEFAULT_TRUSTED_PROXY_HOPS = 2;

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

// Counted from the right: each trusted proxy appends the address it saw, anything left of that is client-supplied.
function clientIp(ctx: RequestContext): string | null {
    const req = ctx.req as { headers?: Record<string, unknown>; ip?: string } | undefined;
    const forwarded = req?.headers?.['x-forwarded-for'];
    const parts = typeof forwarded === 'string' ? forwarded.split(',').map(p => p.trim()) : [];
    const raw = Number(process.env.SEARCH_TRUSTED_PROXY_HOPS);
    const hops = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_TRUSTED_PROXY_HOPS;
    const ip = (parts.length >= hops ? parts[parts.length - hops] : '') || req?.ip;
    return ip ? `ip:${ip}` : null;
}

// Applies to both backends; the external ceiling (2000) must never be reachable by browsing.
export function assertSearchDepth(skip: number | null | undefined): void {
    const raw = Number(process.env.SEARCH_MAX_OFFSET);
    const max = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_OFFSET;
    if ((skip ?? 0) > max) throw new SearchOffsetTooLargeError();
}
