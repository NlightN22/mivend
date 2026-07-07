import * as path from 'path';
import { test, expect } from '@playwright/test';
import { clearCart, gql } from './helpers';

const AUTH_STATE_PATH = path.join(__dirname, '../../.auth/storefront-user.json');

interface SearchItem {
    sku: string;
    productVariantId: string;
}

async function findVariantId(page: import('@playwright/test').Page, sku: string): Promise<string> {
    const result = await gql(
        page,
        `query { search(input: { take: 100 }) { items { sku productVariantId } } }`,
    );
    const items = (result.search as { items: SearchItem[] }).items;
    const item = items.find(i => i.sku === sku);
    if (!item) throw new Error(`Variant not found for sku=${sku}`);
    return item.productVariantId;
}

// Regression test for: the add-to-cart toast used to be computed from catalog-level
// flat compareAtPrice/customerPrice only (see utils/discount.ts, now deleted) — it
// could show a stale/wrong percent when the real applied price (post-mutation) is a
// higher weight/amount tier, because the catalog has no order-context to know about
// tiers. The toast must reflect the *actual* applied discount instead.
test.describe('Add-to-cart toast reflects the real applied discount', () => {
    test('shows the tier percent, not the flat percent, once the shared facet aggregate already qualifies', async ({
        page,
    }) => {
        await clearCart(page);

        // Pre-seed E2E-OIL-001 (weight 100kg) to exactly the 200kg tier threshold via
        // the API, so the *next* UI add-to-cart click for a different same-brand SKU
        // (E2E-OIL-002) is priced against an aggregate that already qualifies for the
        // 25% tier — never the 10% flat rule.
        const oil1 = await findVariantId(page, 'E2E-OIL-001');
        await gql(
            page,
            `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 2) { __typename } }`,
            { id: oil1 },
        );

        await page.goto('/product/engine-oil-5w40-e2e');
        await page.waitForLoadState('networkidle');

        // This is the only order/cart test that mutates the cart through the app's own
        // fetch client (a real UI button click) instead of page.request — every other
        // test in this suite uses the gql() helper exclusively. Vendure rotates the
        // session cookie on this kind of authenticated mutation; Playwright's live
        // cookie jar for *this* page picks up the new value transparently, but the
        // static `.auth/storefront-user.json` file every other test file reloads its
        // own fresh context from is never updated — so it goes stale after this test
        // runs, and every subsequent test silently loses the e2e customer's session
        // (falls back to guest/no-price-type pricing). Re-save it so later tests keep
        // a valid cookie. See docs/e2e-testing.md gotcha #7.
        await page.getByRole('button', { name: 'Add to cart' }).last().click();

        const toast = page.locator('.mv-toast');
        await expect(toast).toBeVisible({ timeout: 10000 });
        await expect(toast).toContainText('25%');
        await expect(toast).not.toContainText('10%');

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });
});
