import { beforeAll, expect, it } from 'vitest';

import { DENIED, admin, staffToken } from '../harness/actors';
import { PRICED_PRODUCT, PRICE_TYPES } from '../seed/fixture-plan';
import { cents, pricedVariant } from './price-type-queries';

const PRICES = `query($v: [ID!]!, $t: String!) { priceEntriesForVariants(variantIds: $v, priceTypeCode: $t) { variantId price } }`;
const FLOORS = `query($v: [ID!]!) { floorPricesForVariants(variantIds: $v) { variantId price } }`;
const FLOOR = `query($v: ID!) { floorPrice(variantId: $v) }`;
const HIDDEN = [PRICE_TYPES.b, PRICE_TYPES.purchase];

let manager: string;
let superadmin: string;
let variantId: string;

beforeAll(async () => {
    manager = await staffToken('manager-a');
    superadmin = await staffToken('superadmin');
    variantId = await pricedVariant();
});

it('a confidential price is denied to the manager and exists for the superadmin', async () => {
    const proof = await admin(superadmin, PRICES, { v: [variantId], t: PRICE_TYPES.purchase });
    expect(proof.errors).toEqual([]);
    expect(JSON.stringify(proof.data)).toContain(
        `"price":${cents(PRICED_PRODUCT.prices.purchase)}`,
    );
    const result = await admin(manager, PRICES, { v: [variantId], t: PRICE_TYPES.purchase });
    expect(result.errors.join()).toMatch(DENIED);
    expect(result.data).toBeNull();
});

it('a customer type outside the branch list is denied as well (deny by default)', async () => {
    const proof = await admin(superadmin, PRICES, { v: [variantId], t: PRICE_TYPES.b });
    expect(JSON.stringify(proof.data)).toContain(`"price":${cents(PRICED_PRODUCT.prices.b)}`);
    const result = await admin(manager, PRICES, { v: [variantId], t: PRICE_TYPES.b });
    expect(result.errors.join()).toMatch(DENIED);
    expect(result.data).toBeNull();
});

it('an allowed type returns its price to the manager', async () => {
    const result = await admin(manager, PRICES, { v: [variantId], t: PRICE_TYPES.a });
    expect(result.errors).toEqual([]);
    expect(JSON.stringify(result.data)).toContain(`"price":${cents(PRICED_PRODUCT.prices.a)}`);
});

it('the floor is denied to the manager and readable by the superadmin', async () => {
    const floor = cents(PRICED_PRODUCT.prices.purchase) * PRICED_PRODUCT.floorMultiplier;
    const proof = await admin(superadmin, FLOORS, { v: [variantId] });
    expect(proof.errors).toEqual([]);
    expect(JSON.stringify(proof.data)).toContain(`"price":${floor}`);
    const many = await admin(manager, FLOORS, { v: [variantId] });
    expect(many.errors.join()).toMatch(DENIED);
    expect(many.data).toBeNull();
    const single = await admin<{ floorPrice: number | null }>(manager, FLOOR, { v: variantId });
    expect(single.errors.join()).toMatch(DENIED);
    expect(single.data?.floorPrice ?? null).toBeNull();
});

it('discount rules and the registry never list or filter by a confidential type', async () => {
    const rules = await admin(
        manager,
        `query($t: String) { discountRules(priceTypeCode: $t) { id } }`,
        {
            t: PRICE_TYPES.purchase,
        },
    );
    expect(rules.errors.join()).toMatch(DENIED);
    const all = await admin(
        manager,
        `{ discountRules { id priceTypeCode } discountRegistryPage(options: { take: 100 }) {
            items { priceTypeCode } } }`,
    );
    expect(all.errors).toEqual([]);
    const text = JSON.stringify(all.data);
    expect(text).toContain(PRICE_TYPES.a);
    for (const code of HIDDEN) expect(text).not.toContain(code);
});

it('a confidential code does not appear in other admin reads', async () => {
    const probes = [
        `{ discountRegistryPage(options: { priceTypeCode: "${PRICE_TYPES.purchase}" }) { items { id } } }`,
        `{ customers(options: { take: 100 }) { items { priceType { code } } } }`,
        `{ priceTypes { code } }`,
    ];
    for (const query of probes) {
        const result = await admin(manager, query);
        const text = JSON.stringify(result.data) + result.errors.join();
        expect(text, query).not.toContain(PRICE_TYPES.purchase);
    }
});
