import { describe, expect, it } from 'vitest';
import { oidcButtonLabel } from '../../pages/auth/oidcLabels';

describe('oidcButtonLabel', () => {
    it('names the provider host', () => {
        expect(oidcButtonLabel('idp.example.com')).toBe('Войти с помощью idp.example.com');
    });
});
