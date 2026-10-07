import { describe, it, expect } from 'vitest';

import { BUYER_NAME_PLACEHOLDER, resolveBuyerLegalName } from '../../pdf/buyer-legal-name';

describe('resolveBuyerLegalName', () => {
    it('returns the full name when present', () => {
        expect(resolveBuyerLegalName('Org A LLC')).toBe('Org A LLC');
    });

    it.each([null, undefined, '', '   '])('falls back to the placeholder for %j', value => {
        expect(resolveBuyerLegalName(value)).toBe(BUYER_NAME_PLACEHOLDER);
    });
});
