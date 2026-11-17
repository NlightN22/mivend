import type { RequestContext } from '@vendure/core';

export type SearchAccess = 'public' | 'storefront' | 'manager';

// Anonymous shoppers get the public endpoint (exact matches only); signed-in shoppers and staff the full one.
export function searchAccessOf(ctx: RequestContext): SearchAccess {
    if (ctx.apiType === 'admin') return 'manager';
    return ctx.activeUserId ? 'storefront' : 'public';
}

export const SEARCH_API_KEY_ENV: Record<SearchAccess, string> = {
    public: 'SEARCH_SERVICE_API_KEY_PUBLIC',
    storefront: 'SEARCH_SERVICE_API_KEY_STOREFRONT',
    manager: 'SEARCH_SERVICE_API_KEY_MANAGER',
};
