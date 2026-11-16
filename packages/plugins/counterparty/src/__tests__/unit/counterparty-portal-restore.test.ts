import { describe, expect, it } from 'vitest';

import { canRestoreLogin, type RevokedLogin } from '../../counterparty-portal-restore.service';

const login: RevokedLogin = { customerId: 5, userId: 9, emailAddress: 'Office@Example.com' };

describe('canRestoreLogin (#375)', () => {
    it('restores when the e-mail is unchanged and free', () => {
        expect(canRestoreLogin(login, 'office@example.com', false)).toBe(true);
    });

    it('compares e-mails without case and surrounding spaces', () => {
        expect(canRestoreLogin(login, '  OFFICE@example.COM ', false)).toBe(true);
    });

    it('creates a new login when the contact e-mail changed', () => {
        expect(canRestoreLogin(login, 'other@example.com', false)).toBe(false);
    });

    it('creates a new login when a live account holds the e-mail', () => {
        expect(canRestoreLogin(login, 'office@example.com', true)).toBe(false);
    });

    it('creates a new login when nothing was revoked', () => {
        expect(canRestoreLogin(null, 'office@example.com', false)).toBe(false);
    });
});
