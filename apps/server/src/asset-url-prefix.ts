import { RequestContext } from '@vendure/core';

const RELATIVE_PREFIX = '/assets/';

export function assetUrlPrefix(
    envPrefix: string | undefined,
): string | ((ctx: RequestContext) => string) {
    if (envPrefix) {
        return envPrefix;
    }
    // The dashboard calls new URL(preview) without a base, so admin-api needs absolute URLs.
    return ctx => {
        if (ctx.apiType !== 'admin') {
            return RELATIVE_PREFIX;
        }
        const { req } = ctx;
        const proto = req?.headers['x-forwarded-proto'] ?? req?.protocol;
        const host = req?.headers['x-forwarded-host'] ?? req?.get('host');
        if (!proto || !host) {
            return RELATIVE_PREFIX;
        }
        const first = (v: string | string[]): string =>
            (Array.isArray(v) ? v[0] : v).split(',')[0].trim();
        return `${first(proto)}://${first(host)}${RELATIVE_PREFIX}`;
    };
}
