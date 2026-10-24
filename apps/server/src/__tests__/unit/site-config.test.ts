import { describe, expect, it } from 'vitest';
import { siteFaviconUrl } from '../../site-config';

describe('siteFaviconUrl', () => {
    it('accepts http(s) URLs and absolute paths, and treats empty as unset', () => {
        for (const ok of [
            'https://example.org/i.png',
            'http://example.org/i.ico?v=1',
            '/assets/a.svg',
        ]) {
            expect(siteFaviconUrl({ SITE_FAVICON_URL: ok })).toBe(ok);
        }
        expect(siteFaviconUrl({})).toBeUndefined();
        expect(siteFaviconUrl({ SITE_FAVICON_URL: '' })).toBeUndefined();
    });

    it('rejects values that would break the nginx config or the HTML', () => {
        const bad = [
            'javascript:1',
            'icon.png',
            'https://a b',
            '/a"b',
            "/a'b",
            '/a$b',
            '/a;b',
            '/a{b',
            '/a\\b',
            '/a<b',
            '/a\nb',
        ];
        for (const url of bad) {
            expect(() => siteFaviconUrl({ SITE_FAVICON_URL: url })).toThrow(/SITE_FAVICON_URL/);
        }
    });
});
