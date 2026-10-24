import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { canSubmit, isDeadLinkCode, isMismatch, isTooShort } from '../../pages/auth/passwordReset';

describe('password reset form rules', () => {
    it('flags a too-short password only once something is typed', () => {
        expect(isTooShort('')).toBe(false);
        expect(isTooShort('1234567')).toBe(true);
        expect(isTooShort('12345678')).toBe(false);
    });

    it('flags a mismatch only once the confirmation is typed', () => {
        expect(isMismatch('abcdefgh', '')).toBe(false);
        expect(isMismatch('abcdefgh', 'abcdefgx')).toBe(true);
        expect(isMismatch('abcdefgh', 'abcdefgh')).toBe(false);
    });

    it('allows submit only for a long enough, matching pair', () => {
        expect(canSubmit('abcdefgh', 'abcdefgh')).toBe(true);
        expect(canSubmit('abcdefg', 'abcdefg')).toBe(false);
        expect(canSubmit('abcdefgh', 'abcdefgx')).toBe(false);
    });

    it.each([
        ['PASSWORD_RESET_TOKEN_INVALID_ERROR', true],
        ['PASSWORD_RESET_TOKEN_EXPIRED_ERROR', true],
        ['PASSWORD_VALIDATION_ERROR', false],
        ['NATIVE_AUTH_STRATEGY_ERROR', false],
        ['VERIFICATION_TOKEN_INVALID_ERROR', true],
        ['VERIFICATION_TOKEN_EXPIRED_ERROR', true],
        ['PASSWORD_ALREADY_SET_ERROR', true],
        ['MISSING_PASSWORD_ERROR', false],
        ['NOT_VERIFIED_ERROR', false],
    ])('%s dead link = %s', (code, dead) => expect(isDeadLinkCode(code)).toBe(dead));
});

const shopApiMock = vi.fn();
vi.mock('../../api/client', async () => {
    const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
    return { ...actual, shopApi: (...args: unknown[]) => shopApiMock(...args) };
});
vi.stubGlobal('sessionStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
});

describe('useAuthStore.resetPassword', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        shopApiMock.mockReset();
    });

    it('starts a session and returns null when Vendure signs the customer in', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock
            .mockResolvedValueOnce({ resetPassword: { __typename: 'CurrentUser', id: '1' } })
            .mockResolvedValueOnce({ activeCustomer: { id: '1', emailAddress: 'a@b.example' } });
        const store = useAuthStore();
        expect(await store.resetPassword('tok', 'new-password')).toBeNull();
        expect(store.authStatus).toBe('authenticated');
        expect(shopApiMock.mock.calls[0][1]).toEqual({ token: 'tok', password: 'new-password' });
    });

    it('returns the errorCode and stays logged out on a rejected token', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock.mockResolvedValueOnce({
            resetPassword: {
                __typename: 'PasswordResetTokenExpiredError',
                errorCode: 'PASSWORD_RESET_TOKEN_EXPIRED_ERROR',
            },
        });
        const store = useAuthStore();
        expect(await store.resetPassword('tok', 'new-password')).toBe(
            'PASSWORD_RESET_TOKEN_EXPIRED_ERROR',
        );
        expect(store.isLoggedIn).toBe(false);
        expect(shopApiMock).toHaveBeenCalledTimes(1);
    });

    it('verifyAccount signs in on success and returns the errorCode on a bad token', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock
            .mockResolvedValueOnce({
                verifyCustomerAccount: { __typename: 'CurrentUser', id: '1' },
            })
            .mockResolvedValueOnce({ activeCustomer: { id: '1', emailAddress: 'a@b.example' } })
            .mockResolvedValueOnce({
                verifyCustomerAccount: {
                    __typename: 'VerificationTokenInvalidError',
                    errorCode: 'VERIFICATION_TOKEN_INVALID_ERROR',
                },
            });
        const store = useAuthStore();
        expect(await store.verifyAccount('tok', 'new-password')).toBeNull();
        expect(store.authStatus).toBe('authenticated');
        expect(await store.verifyAccount('bad', 'new-password')).toBe(
            'VERIFICATION_TOKEN_INVALID_ERROR',
        );
    });
});
