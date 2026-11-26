import { describe, expect, it } from 'vitest';

import { sanitizeErrorText } from '../../error-text';

describe('sanitizeErrorText', () => {
    it('keeps a plain technical message and passes null through', () => {
        expect(sanitizeErrorText('connect ECONNREFUSED 10.0.0.1:9092')).toBe(
            'connect ECONNREFUSED 10.0.0.1:9092',
        );
        expect(sanitizeErrorText(null)).toBeNull();
    });

    it('hides the value of a database constraint detail but keeps the column', () => {
        const text =
            'duplicate key value violates unique constraint "x"; Key (inn)=(7701234567) already exists.';
        expect(sanitizeErrorText(text)).toBe(
            'duplicate key value violates unique constraint "x"; Key (inn)=(…) already exists.',
        );
    });

    it('masks an email address', () => {
        expect(sanitizeErrorText('cannot notify jane.doe@example.com now')).toBe(
            'cannot notify [email] now',
        );
    });

    it('cuts a long message', () => {
        const result = sanitizeErrorText('x'.repeat(500)) as string;
        expect(result).toHaveLength(301);
        expect(result.endsWith('…')).toBe(true);
    });
});
