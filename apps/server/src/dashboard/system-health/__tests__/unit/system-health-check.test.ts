import { describe, it, expect } from 'vitest';
import {
    isZoneMissing,
    isTaxCategoryMissing,
    isTaxRateMissing,
    isDefaultTaxZoneMissing,
    isShippingMethodMissing,
    isPaymentMethodMissing,
} from '../../system-health-check';

// Each check is independent: Zone/TaxCategory/TaxRate can exist while Channel.defaultTaxZone is null
// payment-method is not a plain empty check: existing but none enabled must report missing

describe('system-health predicates', () => {
    it('isZoneMissing / isTaxCategoryMissing / isShippingMethodMissing: true only when totalItems is 0', () => {
        expect(isZoneMissing({ totalItems: 0 })).toBe(true);
        expect(isZoneMissing({ totalItems: 1 })).toBe(false);
        expect(isTaxCategoryMissing({ totalItems: 0 })).toBe(true);
        expect(isTaxCategoryMissing({ totalItems: 2 })).toBe(false);
        expect(isShippingMethodMissing({ totalItems: 0 })).toBe(true);
        expect(isShippingMethodMissing({ totalItems: 1 })).toBe(false);
    });

    it('isTaxRateMissing: true only when the tax rate list is empty', () => {
        expect(isTaxRateMissing({ items: [] })).toBe(true);
        expect(isTaxRateMissing({ items: [{ id: 'x' }] })).toBe(false);
    });

    it('isDefaultTaxZoneMissing: true only when the active channel has no defaultTaxZone', () => {
        expect(isDefaultTaxZoneMissing({ defaultTaxZone: null })).toBe(true);
        expect(isDefaultTaxZoneMissing({ defaultTaxZone: { id: 'zone-1' } })).toBe(false);
    });

    it('isPaymentMethodMissing: true when no payment method exists, and when some exist but none are enabled', () => {
        expect(isPaymentMethodMissing({ items: [] })).toBe(true);
        expect(isPaymentMethodMissing({ items: [{ enabled: false }, { enabled: false }] })).toBe(
            true,
        );
        expect(isPaymentMethodMissing({ items: [{ enabled: false }, { enabled: true }] })).toBe(
            false,
        );
    });
});
