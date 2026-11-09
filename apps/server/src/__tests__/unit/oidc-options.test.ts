import { describe, expect, it } from 'vitest';

import { oidcOptionsFromEnv } from '../../oidc-options';

const FULL = {
    OIDC_ISSUER_URL: 'https://idp.example.com/realms/staff',
    OIDC_CLIENT_ID: 'client-a',
    OIDC_CLIENT_SECRET: 'secret-a',
    OIDC_REDIRECT_URI: 'https://manager.example.com/oidc/callback',
};

describe('oidcOptionsFromEnv', () => {
    it('is disabled when nothing is set', () => {
        expect(oidcOptionsFromEnv({})).toBeNull();
    });
    it('reads the four settings', () => {
        expect(oidcOptionsFromEnv(FULL)).toMatchObject({ clientId: 'client-a' });
    });
    it('fails boot on a partial set', () => {
        expect(() => oidcOptionsFromEnv({ ...FULL, OIDC_CLIENT_SECRET: '' })).toThrow(
            'OIDC_CLIENT_SECRET',
        );
    });
});
