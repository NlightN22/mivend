import { describe, expect, it } from 'vitest';

import { mayApprovePrice } from '../../price-adjustment-eligibility';

const base = {
    requestedPrice: 80,
    reference: 100,
    floor: 50,
    approverCeiling: 20 as number | null,
    canApproveBelowFloor: false,
};

describe('mayApprovePrice', () => {
    it('lets an approver whose limit is at least as deep approve, including a shallower request', () => {
        expect(mayApprovePrice(base)).toBe(true);
        expect(mayApprovePrice({ ...base, requestedPrice: 90 })).toBe(true);
    });

    it('refuses an approver whose limit is shallower than the requested discount', () => {
        expect(mayApprovePrice({ ...base, requestedPrice: 79 })).toBe(false);
    });

    it('treats an unset limit as no limit and a surcharge as no discount', () => {
        expect(mayApprovePrice({ ...base, approverCeiling: null, requestedPrice: 60 })).toBe(true);
        expect(mayApprovePrice({ ...base, approverCeiling: 0, requestedPrice: 130 })).toBe(true);
    });

    it('needs the below-floor right under the floor or with no known floor, whatever the limit', () => {
        const below = { ...base, requestedPrice: 40, approverCeiling: 90 };
        expect(mayApprovePrice(below)).toBe(false);
        expect(mayApprovePrice({ ...below, canApproveBelowFloor: true })).toBe(true);
        expect(mayApprovePrice({ ...base, floor: null })).toBe(false);
    });

    it('still applies the limit to an approver who may go below the floor', () => {
        expect(
            mayApprovePrice({
                ...base,
                requestedPrice: 40,
                approverCeiling: 30,
                canApproveBelowFloor: true,
            }),
        ).toBe(false);
    });
});
