import { describe, expect, it } from 'vitest';

import { mayApprovePrice } from '../../price-adjustment-eligibility';

const base = { requestedPrice: 80, reference: 100, approverCeiling: 20 };

describe('mayApprovePrice', () => {
    it('lets an approver whose limit is at least as deep approve, including a shallower request', () => {
        expect(mayApprovePrice(base)).toBe(true);
        expect(mayApprovePrice({ ...base, requestedPrice: 90 })).toBe(true);
    });

    it('refuses an approver whose limit is shallower than the requested discount', () => {
        expect(mayApprovePrice({ ...base, requestedPrice: 79 })).toBe(false);
    });

    it('treats no row (0%) as unable to approve a discount, but fine for a surcharge', () => {
        expect(mayApprovePrice({ ...base, approverCeiling: 0, requestedPrice: 60 })).toBe(false);
        expect(mayApprovePrice({ ...base, approverCeiling: 0, requestedPrice: 130 })).toBe(true);
    });

    it('applies the same rule below the floor: no extra right, only depth', () => {
        expect(mayApprovePrice({ ...base, requestedPrice: 40, approverCeiling: 90 })).toBe(true);
        expect(mayApprovePrice({ ...base, requestedPrice: 40, approverCeiling: 30 })).toBe(false);
    });
});
