import { describe, expect, it } from 'vitest';
import {
    passwordChangeErrorCode,
    passwordFormError,
    profileUpdateInput,
} from '../../pages/account/settingsForms';

describe('profileUpdateInput', () => {
    it('trims every field', () =>
        expect(profileUpdateInput({ firstName: ' A ', lastName: 'B ', phoneNumber: ' 1' })).toEqual(
            { firstName: 'A', lastName: 'B', phoneNumber: '1' },
        ));

    it('sends a cleared phone as null so Vendure removes it', () =>
        expect(
            profileUpdateInput({ firstName: 'A', lastName: 'B', phoneNumber: '  ' }).phoneNumber,
        ).toBeNull());
});

describe('passwordFormError', () => {
    it('requires all fields before sending', () => {
        expect(passwordFormError({ current: '', next: 'x', confirm: 'x' })).toBe(
            'settings.security.passwordRequired',
        );
        expect(passwordFormError({ current: 'a', next: '', confirm: '' })).toBe(
            'settings.security.passwordRequired',
        );
    });

    it('rejects a confirmation that differs from the new password', () =>
        expect(passwordFormError({ current: 'a', next: 'x', confirm: 'y' })).toBe(
            'settings.security.passwordMismatch',
        ));

    it('accepts a complete matching form', () =>
        expect(passwordFormError({ current: 'a', next: 'x', confirm: 'x' })).toBeNull());
});

describe('passwordChangeErrorCode', () => {
    it('returns the server error code or null on success', () => {
        expect(passwordChangeErrorCode({ errorCode: 'INVALID_CREDENTIALS_ERROR' })).toBe(
            'INVALID_CREDENTIALS_ERROR',
        );
        expect(passwordChangeErrorCode({ success: true })).toBeNull();
    });
});
