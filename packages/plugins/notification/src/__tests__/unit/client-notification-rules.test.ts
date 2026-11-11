import { describe, expect, it } from 'vitest';

import {
    MAX_MESSAGE_LENGTH,
    MAX_TITLE_LENGTH,
    normalizeClientNotification,
} from '../../client-notification-rules';

describe('normalizeClientNotification', () => {
    it('trims text and treats a missing title as empty', () => {
        expect(normalizeClientNotification({ kind: 'error', message: '  Saved failed  ' })).toEqual(
            {
                kind: 'error',
                title: '',
                message: 'Saved failed',
            },
        );
    });

    it('rejects an empty or whitespace-only message', () => {
        expect(() => normalizeClientNotification({ kind: 'info', message: '   ' })).toThrow();
    });

    it('accepts the maximum lengths and rejects one more character', () => {
        const ok = {
            kind: 'info' as const,
            title: 't'.repeat(MAX_TITLE_LENGTH),
            message: 'm'.repeat(MAX_MESSAGE_LENGTH),
        };
        expect(normalizeClientNotification(ok)).toEqual(ok);
        expect(() => normalizeClientNotification({ ...ok, title: ok.title + 't' })).toThrow();
        expect(() => normalizeClientNotification({ ...ok, message: ok.message + 'm' })).toThrow();
    });
});
