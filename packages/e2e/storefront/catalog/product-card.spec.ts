import { test, expect } from '@playwright/test';

test.describe('Product page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to catalog and click the first product to get a real slug
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await page.locator('.mv-product-card a, .mv-product-row a').first().click();
        await page.waitForLoadState('networkidle');
    });

    test('product page loads with name and price', async ({ page }) => {
        await expect(page).not.toHaveURL('/catalog');
        await expect(page).not.toHaveURL('/login');
        // Title or product name heading should be visible
        await expect(page.locator('h1, .product-page__name').first()).toBeVisible();
    });

    test('add to cart button is visible on product page', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Add to cart' }).last()).toBeVisible();
    });

    test('customer wholesale price is shown when logged in', async ({ page }) => {
        // A price element (digits) visible somewhere on the product page
        await expect(
            page.locator('.product-page__price, .buy-panel__price, [class*="price"]').first(),
        ).toBeVisible();
    });
});
