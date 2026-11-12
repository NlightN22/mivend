import { describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';

describe('oidc sign-in button label', () => {
    it('names the provider host', () => {
        expect(i18n.global.t('auth.oidc.button', { host: 'idp.example.com' })).toBe(
            'Sign in with idp.example.com',
        );
    });
});
