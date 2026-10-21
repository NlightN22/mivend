import { describe, expect, it } from 'vitest';

import { priceTypeGapReason } from '../../price-type-gap.service';

describe('priceTypeGapReason', () => {
    const contracts = new Map([
        ['active', { isActive: true }],
        ['inactive', { isActive: false }],
    ]);

    it.each([
        [null, 'no-main-contract'],
        ['missing', 'contract-not-found'],
        ['inactive', 'contract-inactive'],
        ['active', 'price-type-not-synced'],
    ])('maps main contract %s to %s', (mainContractId, reason) => {
        expect(priceTypeGapReason(mainContractId, contracts)).toBe(reason);
    });
});
