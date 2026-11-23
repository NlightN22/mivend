import { describe, it, expect } from 'vitest';
import { emailConfirmationIndicator, resendErrorKind } from '../../utils/emailConfirmation';

describe('emailConfirmationIndicator', () => {
    it('is hidden without a pending address', () => {
        expect(emailConfirmationIndicator(null, null)).toBeNull();
        expect(emailConfirmationIndicator('', '2026-11-23T10:00:00Z')).toBeNull();
    });

    it('carries the pending address and the send time', () => {
        expect(emailConfirmationIndicator('new@example.com', '2026-11-23T10:00:00Z')).toEqual({
            address: 'new@example.com',
            sentAt: '2026-11-23T10:00:00Z',
        });
    });
});

describe('resendErrorKind', () => {
    it.each([
        ['A confirmation link was sent less than 5 minutes ago', 'cooldown'],
        ['This customer has no e-mail address waiting for confirmation', 'nothingPending'],
        ['Network error', 'generic'],
        ['', 'generic'],
    ])('maps %j to %s', (message, kind) => {
        expect(resendErrorKind(message)).toBe(kind);
    });
});
