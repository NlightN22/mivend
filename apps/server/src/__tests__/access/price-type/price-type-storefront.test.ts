import { describe, expect, it } from 'vitest';

import { customerToken, shop } from '../harness/actors';
import {
    BRANCH_PRICE_TYPE,
    CUSTOMERS,
    PRICED_PRODUCT,
    PRICE_TYPES,
    type CustomerKey,
} from '../seed/fixture-plan';

const PRODUCT = `query { product(slug: "access-priced-product") {
    variants { id sku price priceWithTax customerPrice compareAtPrice } } }`;
const LEAKING_FIELDS = /"(floorPrice|purchasePrice|priceTypeCode|priceTypeErpId)"\s*:/;
const BRANCH_OF: Record<CustomerKey, 'a' | 'b'> = { 'customer-a': 'a', 'customer-b': 'b' };

type Variants = { product: { variants: { sku: string; customerPrice: number | null }[] } };

describe.each(CUSTOMERS.map(c => c.key))('storefront price for %s', (key: CustomerKey) => {
    it('carries the own branch type price and no confidential code, field or purchase price', async () => {
        const result = await shop<Variants>(await customerToken(key), PRODUCT);
        expect(result.errors).toEqual([]);
        const variant = result.data!.product.variants.find(v => v.sku === PRICED_PRODUCT.sku)!;
        const own = PRICED_PRODUCT.prices[BRANCH_OF[key]];
        expect(BRANCH_PRICE_TYPE[BRANCH_OF[key]]).toBe(PRICE_TYPES[BRANCH_OF[key]]);
        expect([own, own * 100], 'the own type price').toContain(variant.customerPrice);
        const body = JSON.stringify(result.data);
        expect(body).not.toContain(PRICE_TYPES.purchase);
        expect(body).not.toMatch(LEAKING_FIELDS);
        const unit = variant.customerPrice === own ? 1 : 100;
        expect(body).not.toContain(`:${PRICED_PRODUCT.prices.purchase * unit},`);
        expect(body).not.toContain(`:${PRICED_PRODUCT.prices.purchase * unit}}`);
    });
});
