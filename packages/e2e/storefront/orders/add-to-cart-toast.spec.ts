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

// Toast must show the actual applied discount: catalog-level prices have no order context,
// so they can't know which weight/amount tier applies after the mutation.
test.describe('Add-to-cart toast reflects the real applied discount', () => {
    test('shows the tier percent, not the flat percent, once the shared facet aggregate already qualifies', async ({
        page,
    }) => {
        await clearCart(page);

        // Seed exactly at the 200kg tier threshold so the next add prices at the 25% tier,
        // not the 10% flat rule.
        const oil1 = await findVariantId(page, 'E2E-OIL-001');
        await gql(
            page,
            `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 2) { __typename } }`,
            { id: oil1 },
        );

        await page.goto('/product/engine-oil-5w40-e2e');
        await page.waitForLoadState('networkidle');

        // Vendure rotates the session cookie on this UI mutation; the live jar updates but the static
        // .auth/storefront-user.json does not, so re-save it or later tests lose the customer session.
        await page.getByRole('button', { name: 'Add to cart' }).last().click();

        const toast = page.locator('.mv-toast');
        await expect(toast).toBeVisible({ timeout: 10000 });
        await expect(toast).toContainText('25%');
        await expect(toast).not.toContainText('10%');

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });
});
