import { describe, expect, it } from 'vitest';

import { capabilitiesFor } from '../../search-capabilities';

describe('capabilitiesFor', () => {
    it('external backend supports price sort and the price range', () => {
        expect(capabilitiesFor('external')).toEqual({
            sortKeys: ['relevance', 'name_asc', 'name_desc', 'price_asc', 'price_desc'],
            priceRange: true,
        });
    });

    it('internal backend has no price sort and no price range', () => {
        expect(capabilitiesFor('internal')).toEqual({
            sortKeys: ['relevance', 'name_asc', 'name_desc'],
            priceRange: false,
        });
    });
});
