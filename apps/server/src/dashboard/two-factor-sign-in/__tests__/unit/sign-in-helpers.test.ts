import { describe, expect, it } from 'vitest';

import { buildQrPath } from '../../qr-path';
import { resolveRedirectTarget } from '../../redirect-target';
import { fillEmail, pickLabels } from '../../two-factor-sign-in-labels';

describe('redirect target', () => {
    it('follows a same-origin path and falls back otherwise', () => {
        expect(resolveRedirectTarget('?redirect=%2Forders%3Fx%3D1')).toBe('/orders?x=1');
        expect(resolveRedirectTarget('')).toBe('/');
        expect(resolveRedirectTarget('?redirect=https%3A%2F%2Fevil.example')).toBe('/');
        expect(resolveRedirectTarget('?redirect=%2F%2Fevil.example')).toBe('/');
        expect(resolveRedirectTarget('?redirect=%2F%5Cevil.example')).toBe('/');
    });
});

describe('labels', () => {
    it('picks Russian for ru locales and English otherwise', () => {
        expect(pickLabels('ru-RU').signIn).toBe('Войти');
        expect(pickLabels('en-US').signIn).toBe('Sign in');
        expect(pickLabels(undefined).signIn).toBe('Sign in');
    });

    it('has a message for every error in both languages', () => {
        for (const language of ['ru', 'en']) {
            for (const text of Object.values(pickLabels(language).errors))
                expect(text).not.toBe('');
        }
    });

    it('fills the masked address', () => {
        expect(fillEmail('sent to {email}.', 'j***@example.org')).toBe('sent to j***@example.org.');
    });
});

describe('qr path', () => {
    it('draws a square code with a quiet zone', () => {
        const qr = buildQrPath('otpauth://totp/x?secret=ABCDEFGH');
        expect(qr.size).toBeGreaterThan(20);
        expect(qr.path.startsWith('M')).toBe(true);
    });
});
