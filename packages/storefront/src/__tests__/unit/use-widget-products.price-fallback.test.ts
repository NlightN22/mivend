import { describe, it, expect } from 'vitest';

import { withResolvedPrice } from '../../composables/useWidgetProducts';
import type { ProductItem } from '../../composables/useProductList';

// Issue #70/mivend.audit.70: useWidgetProducts.ts's withResolvedPrice() has the same class of
// bug useProductList.ts had — `?? 0` made an unresolved (null) customerPrice display as 0,
// indistinguishable from a genuinely free product. Fixed alongside useProductList.ts's own fix;
// this file covers the widget composable's own copy of the same logic, which the audit flagged
// as untested.

function makeItem(customerPrice: number | null): ProductItem {
    return {
        id: 'p-1',
        name: 'Widget Product',
        slug: 'widget-product',
        facetValues: [],
        variants: [
            {
                id: 'v-1',
                sku: 'SKU-W',
                price: 9999,
                customerPrice,
                compareAtPrice: null,
                discountTiers: [],
                currencyCode: 'RUB',
                stockLevel: 'IN_STOCK',
            },
        ],
    };
}

describe('withResolvedPrice', () => {
    it('uses the resolved customerPrice, overwriting the raw listPrice', () => {
        const [result] = withResolvedPrice([makeItem(1234)]);
        expect(result.variants[0].price).toBe(1234);
    });

    it('maps a null (unresolved) customerPrice to undefined, never 0', () => {
        const [result] = withResolvedPrice([makeItem(null)]);
        expect(result.variants[0].price).toBeUndefined();
        expect(result.variants[0].price).not.toBe(0);
    });

    it('never surfaces a raw non-zero listPrice, even when customerPrice happens to be 0', () => {
        const [result] = withResolvedPrice([makeItem(0)]);
        expect(result.variants[0].price).toBe(0);
        expect(result.variants[0].price).not.toBe(9999);
    });
});
