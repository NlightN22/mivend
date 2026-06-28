import { test, expect } from '@playwright/test';

test.describe('Catalog filters', () => {
    test('catalog page loads and shows products', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL('/login');
        await expect(page.getByText('Engine Oil 5W-30')).toBeVisible({ timeout: 10000 });
    });

    test('in-stock products are visible by default', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        await expect(page.getByText('Engine Oil 5W-30')).toBeVisible();
        await expect(page.getByText('Air Filter')).toBeVisible();
    });
});
