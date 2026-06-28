import { test, expect } from '@playwright/test';

test.describe('Catalog filters', () => {
    test('catalog page loads and shows products', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL('/login');
        // Any product card or row should be visible
        await expect(page.locator('.mv-product-card, .mv-product-row').first()).toBeVisible({
            timeout: 10000,
        });
    });

    test('in-stock products are visible by default', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        // At least one product card visible
        const cards = page.locator('.mv-product-card, .mv-product-row');
        await expect(cards.first()).toBeVisible();
        expect(await cards.count()).toBeGreaterThan(0);
    });
});
