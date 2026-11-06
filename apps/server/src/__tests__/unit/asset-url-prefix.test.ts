import { RequestContext } from '@vendure/core';
import { describe, expect, it } from 'vitest';
import { assetUrlPrefix } from '../../asset-url-prefix';

function ctx(apiType: 'admin' | 'shop', headers: Record<string, string> = {}): RequestContext {
    const req = {
        headers,
        protocol: 'http',
        get: (name: string) => (name === 'host' ? 'internal:3000' : undefined),
    };
    return { apiType, req } as unknown as RequestContext;
}

describe('assetUrlPrefix', () => {
    const fn = assetUrlPrefix(undefined) as (c: RequestContext) => string;

    it('keeps shop-api URLs root-relative', () => {
        expect(fn(ctx('shop', { 'x-forwarded-host': 'cp.example.com' }))).toBe('/assets/');
    });

    it('returns an absolute URL for admin-api from forwarded headers', () => {
        const c = ctx('admin', {
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'cp.example.com',
        });
        expect(fn(c)).toBe('https://cp.example.com/assets/');
    });

    it('falls back to the request host and protocol without forwarded headers', () => {
        expect(fn(ctx('admin'))).toBe('http://internal:3000/assets/');
    });

    it('lets ASSET_URL_PREFIX override everything', () => {
        expect(assetUrlPrefix('https://cdn.example.com/assets/')).toBe(
            'https://cdn.example.com/assets/',
        );
    });
});
