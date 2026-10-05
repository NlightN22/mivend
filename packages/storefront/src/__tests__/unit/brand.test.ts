import { describe, expect, it } from 'vitest';

import { brandOf } from '../../utils/brand';

describe('brandOf', () => {
    it('returns the manufacturer name', () => {
        expect(brandOf({ name: 'Maker' })).toBe('Maker');
    });

    it.each([null, undefined, { name: null }])('returns an empty string for %j', manufacturer => {
        expect(brandOf(manufacturer)).toBe('');
    });
});
