import { describe, expect, it } from 'vitest';

import { categoryOf, parseVisibility } from '../../settlement-visibility';

describe('parseVisibility', () => {
    it('treats empty settings as no restriction', () => {
        const v = parseVisibility({});
        expect(v.contractKinds).toEqual([]);
        expect(v.typeCategories.size).toBe(0);
        expect(categoryOf(v, 'AnyType')).toBe('other');
    });

    it('parses contract kinds and documentType=category pairs', () => {
        const v = parseVisibility({
            settlementCustomerContractKinds: 'client, retail',
            settlementTypeCategories: 'Sale=sale,\nPayment=payment, Odd',
        });
        expect(v.contractKinds).toEqual(['client', 'retail']);
        expect(categoryOf(v, 'Sale')).toBe('sale');
        expect(categoryOf(v, 'Payment')).toBe('payment');
        expect(v.typeCategories.get('Odd')).toBe('other');
        expect(categoryOf(v, 'Unlisted')).toBe('other');
    });
});
