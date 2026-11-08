import type { RequestContext } from '@vendure/core';

// Counted from the right: each trusted proxy appends the address it saw; anything further left is client-supplied.
export function clientIp(ctx: RequestContext, trustedProxyHops: number): string {
    const req = ctx.req as { headers?: Record<string, unknown>; ip?: string } | undefined;
    const forwarded = req?.headers?.['x-forwarded-for'];
    const parts = typeof forwarded === 'string' ? forwarded.split(',').map(p => p.trim()) : [];
    const fromProxy =
        parts.length >= trustedProxyHops ? parts[parts.length - trustedProxyHops] : '';
    return fromProxy || req?.ip || 'unknown';
}
