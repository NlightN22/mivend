import { describe, expect, it } from 'vitest';

import { formatLineQuantity } from '../../composables/lineSalesUnit';

const fields = { unitName: 'pack', unitRatioToBase: 10 };

describe('formatLineQuantity', () => {
    it('shows packs with the base quantity for a packages-only order', () => {
        expect(formatLineQuantity(30, fields, true)).toBe('3 pack (= 30)');
    });

    it('shows the plain quantity when the order is not packages-only or the unit is the base one', () => {
        expect(formatLineQuantity(30, fields, false)).toBe('30');
        expect(formatLineQuantity(30, { unitName: 'pc', unitRatioToBase: 1 }, true)).toBe('30');
        expect(formatLineQuantity(30, null, true)).toBe('30');
    });
});
