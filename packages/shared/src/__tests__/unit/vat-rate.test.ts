import { describe, expect, it } from 'vitest';

import { isUnconfirmedTaxRateName, unconfirmedTaxRateName } from '../../vatRate';

describe('unconfirmed tax rate naming', () => {
    it('recognizes the name the ERP integration gives a placeholder rate', () => {
        expect(isUnconfirmedTaxRateName(unconfirmedTaxRateName('VAT10', 'zone-a'))).toBe(true);
    });

    it('does not flag a confirmed rate name', () => {
        expect(isUnconfirmedTaxRateName('VAT10 (zone-a)')).toBe(false);
    });
});
