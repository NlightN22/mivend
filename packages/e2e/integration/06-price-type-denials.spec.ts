import { test, expect } from '@playwright/test';
import { select } from './contour-db';
import { loadContourEnv } from './contour-env';
import {
    MANAGER_MISSING_REASON,
    adminCall,
    expectedSplit,
    managerToken,
    superadminToken,
    type PriceTypeSplit,
} from './price-type-access';

const DENIED = /not currently authorized|forbidden/i;
const PRICES = `query($v: [ID!]!, $t: String!) { priceEntriesForVariants(variantIds: $v, priceTypeCode: $t) { variantId price } }`;

let split: PriceTypeSplit;
let manager: string;
let superadmin: string;
let variantId: string;
let priceByType: Map<string, string>;

test.beforeAll(async () => {
    const env = loadContourEnv();
    if (!env.manager) return;
    split = expectedSplit(env.manager.username);
    manager = await managerToken();
    superadmin = await superadminToken();
    const confidential = split.confidential.map(c => `'${c}'`).join(',');
    variantId = select<{ id: string }>(
        `SELECT "variantId" AS id FROM product_variant_price_entry WHERE "priceTypeCode" IN (${confidential})
         GROUP BY "variantId" HAVING count(DISTINCT "priceTypeCode") >= 1 ORDER BY 1 LIMIT 1`,
    )[0].id;
    priceByType = new Map(
        select<{ code: string; price: string }>(
            `SELECT "priceTypeCode" AS code, price::text FROM product_variant_price_entry WHERE "variantId" = '${variantId}'`,
        ).map(r => [r.code, r.price]),
    );
});
test.beforeEach(() => {
    test.skip(!loadContourEnv().manager, MANAGER_MISSING_REASON);
});

test('6: prices of a confidential type are denied to the manager and exist for the superadmin', async () => {
    for (const code of split.confidential) {
        if (!priceByType.has(code)) continue;
        const proof = await adminCall(superadmin, PRICES, { v: [variantId], t: code });
        expect(proof.errors, `superadmin reads ${code}`).toEqual([]);
        expect(JSON.stringify(proof.data)).toContain(`"price":${priceByType.get(code)}`);

        const result = await adminCall(manager, PRICES, { v: [variantId], t: code });
        expect(result.errors.join(), `manager denied ${code}`).toMatch(DENIED);
        expect(result.data).toBeNull();
    }
    expect(priceByType.has('zakupochnaya'), 'the purchase type has a price to protect').toBe(true);
});

test('6: a customer type outside the branch list is denied as well (deny by default)', async () => {
    const outside = split.hidden.filter(c => !split.confidential.includes(c) && priceByType.has(c));
    expect(outside.length, 'a hidden customer type with a price').toBeGreaterThan(0);
    for (const code of outside) {
        const result = await adminCall(manager, PRICES, { v: [variantId], t: code });
        expect(result.errors.join(), `manager denied ${code}`).toMatch(DENIED);
    }
});

test('6: an allowed type returns its price to the manager', async () => {
    const code = split.allowed.find(c => priceByType.has(c));
    expect(code, 'an allowed type with a price on the probe variant').toBeTruthy();
    const result = await adminCall(manager, PRICES, { v: [variantId], t: code! });
    expect(result.errors).toEqual([]);
    expect(JSON.stringify(result.data)).toContain(`"price":${priceByType.get(code!)}`);
});

test('6: the floor is denied to the manager and readable by the superadmin', async () => {
    // A whole-number floor: the batch query types prices as Int, so fractional floors fail even for the superadmin.
    const probe = select<{ id: string }>(
        `SELECT "variantId" AS id FROM product_variant_price_entry
         WHERE "priceTypeCode" = 'zakupochnaya' AND price % 50 = 0 ORDER BY 1 LIMIT 1`,
    )[0]?.id;
    expect(probe, 'a variant with a purchase price and a whole-number floor').toBeTruthy();
    const batch = `query($v: [ID!]!) { floorPricesForVariants(variantIds: $v) { variantId price } }`;
    const proof = await adminCall(superadmin, batch, { v: [probe] });
    expect(proof.errors).toEqual([]);
    expect(JSON.stringify(proof.data)).toMatch(/"price":\d+/);

    const many = await adminCall(manager, batch, { v: [probe] });
    expect(many.errors.join()).toMatch(DENIED);
    expect(many.data).toBeNull();
    const single = await adminCall(manager, `query($v: ID!) { floorPrice(variantId: $v) }`, {
        v: probe,
    });
    expect(single.errors.join()).toMatch(DENIED);
    expect(single.data).toBeNull();
});

test('6: discount rules and the registry never list or filter by a confidential type', async () => {
    for (const code of split.confidential) {
        const rules = await adminCall(
            manager,
            `query($t: String) { discountRules(priceTypeCode: $t) { id } }`,
            { t: code },
        );
        expect(rules.errors.join(), `rules of ${code}`).toMatch(DENIED);
    }
    const all = await adminCall(
        manager,
        `{ discountRules { id priceTypeCode } discountRegistryPage(options: { take: 100 }) {
            items { priceTypeCode } } }`,
    );
    expect(all.errors).toEqual([]);
    const text = JSON.stringify(all.data);
    for (const code of split.hidden) expect(text).not.toContain(code);
});

test('6: a confidential code does not appear in other admin reads', async () => {
    const probes = [
        `{ discountRegistryPage(options: { priceTypeCode: "zakupochnaya" }) { items { id } } }`,
        `{ customers(options: { take: 100 }) { items { priceType { code } } } }`,
        `{ priceTypes { code } }`,
    ];
    for (const query of probes) {
        const result = await adminCall(manager, query);
        const text = JSON.stringify(result.data) + result.errors.join();
        for (const code of split.confidential) expect(text, query).not.toContain(code);
    }
});
