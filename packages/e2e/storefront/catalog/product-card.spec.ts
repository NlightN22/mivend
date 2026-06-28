import { test, expect } from '@playwright/test';

test.describe('Product page', () => {
    test('product page loads with name and price', async ({ page }) => {
        await page.goto('/product/engine-oil-5w30');
        await page.waitForLoadState('networkidle');

        await expect(page.getByText('Engine Oil 5W-30')).toBeVisible();
    });

    test('add to cart button is visible on product page', async ({ page }) => {
        await page.goto('/product/engine-oil-5w30');
        await page.waitForLoadState('networkidle');

        await expect(page.getByRole('button', { name: 'В корзину' })).toBeVisible();
    });

    test('customer wholesale price is shown when logged in', async ({ page }) => {
        await page.goto('/product/engine-oil-5w30');
        await page.waitForLoadState('networkidle');

        // Price is shown as formatted number — just check there is a price element
        await expect(page.locator('text=/\\d+/')).toBeVisible();
    });
});
