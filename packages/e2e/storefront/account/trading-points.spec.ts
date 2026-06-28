import { test, expect } from '@playwright/test';

test.describe('Trading points', () => {
    test('trading points page loads without redirect', async ({ page }) => {
        await page.goto('/account/trading-points');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL('/login');
    });

    test('seeded trading point is visible in the list', async ({ page }) => {
        await page.goto('/account/trading-points');
        await page.waitForLoadState('networkidle');

        await expect(page.getByText('E2E Trading Point')).toBeVisible({ timeout: 10000 });
    });
});
