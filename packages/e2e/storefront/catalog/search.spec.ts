import { test, expect } from '@playwright/test';

const SEARCH_PLACEHOLDER = 'Article, VIN, brand, name or OEM';

test.describe('Catalog search', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
    });

    test('search by SKU returns matching product', async ({ page }) => {
        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');

        await page.waitForLoadState('networkidle');
        await expect(page.getByText('Engine Oil 5W-30').first()).toBeVisible({ timeout: 10000 });
    });

    test('search by OEM code returns matching product', async ({ page }) => {
        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('15400-RTA-003');
        await searchInput.press('Enter');

        await page.waitForLoadState('networkidle');
        await expect(page.getByText('Engine Oil 5W-30').first()).toBeVisible({ timeout: 10000 });
    });

    test('clearing search term restores full catalog', async ({ page }) => {
        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        await searchInput.clear();
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const url = new URL(page.url());
        expect(url.searchParams.get('q') ?? '').toBe('');
    });
});
