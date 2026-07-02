import { test, expect } from '@playwright/test';

const LIST_ROW = '.mv-product-row';
const GRID_CARD = '.mv-product-card';

test.describe('View mode persistence', () => {
    test.beforeEach(async ({ page }) => {
        // Clear stored preference so each test starts from default
        await page.goto('/catalog');
        await page.evaluate(() => localStorage.removeItem('preferred-view-mode'));
    });

    test('default view is list', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(LIST_ROW).first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator(GRID_CARD).first()).not.toBeVisible();
    });

    test('switching to grid shows cards', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(LIST_ROW).first()).toBeVisible({ timeout: 10000 });

        await page.getByRole('button', { name: /Grid/ }).click();
        await expect(page.locator(GRID_CARD).first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator(LIST_ROW).first()).not.toBeVisible();
    });

    test('grid preference persists after navigating away and back', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(LIST_ROW).first()).toBeVisible({ timeout: 10000 });

        await page.getByRole('button', { name: /Grid/ }).click();
        await expect(page.locator(GRID_CARD).first()).toBeVisible({ timeout: 5000 });

        // Navigate away
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Navigate back to catalog
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(GRID_CARD).first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator(LIST_ROW).first()).not.toBeVisible();
    });

    test('grid preference persists across page reload', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(LIST_ROW).first()).toBeVisible({ timeout: 10000 });

        await page.getByRole('button', { name: /Grid/ }).click();
        await expect(page.locator(GRID_CARD).first()).toBeVisible({ timeout: 5000 });

        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator(GRID_CARD).first()).toBeVisible({ timeout: 10000 });
    });

    test('preference is shared between catalog and home page', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(LIST_ROW).first()).toBeVisible({ timeout: 10000 });

        await page.getByRole('button', { name: /Grid/ }).click();
        await expect(page.locator(GRID_CARD).first()).toBeVisible({ timeout: 5000 });

        // Home page should also show grid
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(GRID_CARD).first()).toBeVisible({ timeout: 10000 });
    });
});
