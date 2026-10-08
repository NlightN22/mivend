import { describe, expect, it } from 'vitest';
import type { ProductVariant } from '@vendure/core';

import { ProductVariantAvailabilityResolver } from '../../variant-availability.resolver';

const variant = (customFields: ProductVariant['customFields']) =>
    ({ customFields }) as ProductVariant;

describe('ProductVariantAvailabilityResolver', () => {
    const resolver = new ProductVariantAvailabilityResolver();

    it('is available only when the variant has an organization', () => {
        expect(resolver.availableForOrder(variant({ organizationId: 3 }))).toBe(true);
        expect(resolver.availableForOrder(variant({ organizationId: null }))).toBe(false);
        expect(resolver.availableForOrder(variant({}))).toBe(false);
    });
});
