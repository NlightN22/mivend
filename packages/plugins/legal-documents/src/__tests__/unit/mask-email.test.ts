import { describe, expect, it } from 'vitest';

import { maskEmail } from '../../mask-email';

describe('maskEmail', () => {
    it('keeps the first character of the name and domain and the top-level domain', () => {
        expect(maskEmail('alice@domain.org')).toBe('a***@d***.org');
        expect(maskEmail('a@b.co.uk')).toBe('a***@b***.uk');
    });

    it('hides everything for a value that is not an address', () => {
        expect(maskEmail('nonsense')).toBe('***');
        expect(maskEmail('@x.org')).toBe('***');
    });
});
