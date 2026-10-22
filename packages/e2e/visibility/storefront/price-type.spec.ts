import { expect, test } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { PRODUCT, VIS_PRICE_TYPES, type CustomerKey } from '../../fixtures/visibility/plan';
import { openStorefrontAs, shot, superadminToken } from '../session';

const LEAKING_FIELDS = /"(floorPrice|purchasePrice|priceTypeCode|priceTypeErpId)"\s*:/;
const money = (value: number): string =>
    `₽${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

let confidential: string[];

test.beforeAll(async () => {
    const { data } = await adminGql<{ priceTypes: { code: string; visibility: string }[] }>(
        `{ priceTypes { code visibility } }`,
        undefined,
        await superadminToken(),
    );
    confidential = data.priceTypes.filter(t => t.visibility === 'confidential').map(t => t.code);
    expect(confidential).toContain(VIS_PRICE_TYPES.confidential);
});

const CASES: { customer: CustomerKey; own: number; others: number[] }[] = [
    {
        customer: 'customer-a',
        own: PRODUCT.prices.a,
        others: [PRODUCT.prices.b, PRODUCT.prices.confidential],
    },
    {
        customer: 'customer-b',
        own: PRODUCT.prices.b,
        others: [PRODUCT.prices.a, PRODUCT.prices.confidential],
    },
];

for (const { customer, own, others } of CASES) {
    test(`05: ${customer} sees its own price type's price and no confidential data`, async ({
        browser,
    }) => {
        test.setTimeout(90_000);
        const s = await openStorefrontAs(browser, customer);
        try {
            const texts: string[] = [];
            for (const path of ['/', '/catalog', '/cart', '/favorites', '/account']) {
                await s.page.goto(path);
                await expect(s.page.getByText('Catalogue').first()).toBeVisible({ timeout: 15000 });
                texts.push(await s.page.locator('body').innerText());
            }
            await s.page.goto(`/product/${PRODUCT.slug}`);
            await expect(s.page.getByText(money(own), { exact: true }).first()).toBeVisible({
                timeout: 15000,
            });
            for (const price of others) await expect(s.page.getByText(money(price))).toHaveCount(0);
            await shot(s.page, `storefront-product-${customer}`);
            texts.push(await s.page.locator('body').innerText());
            const everything = [...texts, ...s.bodies].join('\n');
            for (const code of confidential) expect(everything, code).not.toContain(code);
            expect(everything).not.toMatch(LEAKING_FIELDS);
        } finally {
            await s.context.close();
        }
    });
}
