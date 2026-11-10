import { describe, expect, it } from 'vitest';

import { twoFactorOptionsFromEnv } from '../../two-factor-options';

const ENV = {
    SITE_NAME: 'Site A',
    STOREFRONT_PUBLIC_URL: 'https://shop.example.com',
    MANAGER_PUBLIC_URL: 'https://sales.example.com:8443/',
};

describe('twoFactorOptionsFromEnv issuer', () => {
    it('names each portal entry by its domain', () => {
        expect(twoFactorOptionsFromEnv(ENV, 'cookie-secret').issuerByApi).toEqual({
            shop: 'shop.example.com',
            admin: 'sales.example.com',
        });
    });

    it('falls back to the site name when a portal URL is unset or not a URL', () => {
        const options = twoFactorOptionsFromEnv(
            { SITE_NAME: 'Site A', MANAGER_PUBLIC_URL: 'not a url' },
            'cookie-secret',
        );
        expect(options.issuerByApi).toEqual({ shop: undefined, admin: undefined });
        expect(options.issuer).toBe('Site A');
    });
});
