import { describe, it, expect } from 'vitest';

import { mapProductTier2Fields } from '../../product-tier2-fields';

describe('mapProductTier2Fields', () => {
    it('maps manufacturer when present', () => {
        const result = mapProductTier2Fields({ manufacturer: 'Acme' });

        expect(result).toEqual({ manufacturer: 'Acme' });
    });

    // proto3's canonical JSON mapping omits an `optional` scalar field entirely when it's
    // genuinely unset — same zero-value-omission discipline as isActive elsewhere in this plugin.
    it('returns an empty object when manufacturer is absent', () => {
        const result = mapProductTier2Fields({ sku: 'SKU-1', name: 'Widget' });

        expect(result).toEqual({});
    });

    it('treats an empty string the same as absent', () => {
        const result = mapProductTier2Fields({ manufacturer: '' });

        expect(result).toEqual({});
    });
});
