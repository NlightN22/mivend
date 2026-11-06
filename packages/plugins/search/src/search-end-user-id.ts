import { createHmac } from 'crypto';
import type { RequestContext } from '@vendure/core';

import { SearchOffsetTooLargeError } from './search-errors';

const DEFAULT_MAX_OFFSET = 1900;

// Keyed hash (64 hex chars): stable per customer or anonymous session, carries no personal data.
export function searchEndUserId(ctx: RequestContext): string | undefined {
    const secret = process.env.SEARCH_END_USER_ID_SECRET;
    if (!secret) return undefined;
    const subject = ctx.activeUserId
        ? `user:${ctx.activeUserId}`
        : ctx.session?.token
          ? `session:${ctx.session.token}`
          : null;
    if (!subject) return undefined;
    return createHmac('sha256', secret).update(subject).digest('hex');
}

// Applies to both backends; the external ceiling (2000) must never be reachable by browsing.
export function assertSearchDepth(skip: number | null | undefined): void {
    const raw = Number(process.env.SEARCH_MAX_OFFSET);
    const max = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_OFFSET;
    if ((skip ?? 0) > max) throw new SearchOffsetTooLargeError();
}
