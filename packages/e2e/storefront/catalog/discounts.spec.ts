import { test, expect } from '@playwright/test';

const SEARCH_PLACEHOLDER = 'Article, VIN, brand, name or OEM';

async function esAvailable(): Promise<boolean> {
    try {
        const res = await fetch(
            process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200/_cluster/health',
        );
        return res.ok;
    } catch {
        return false;
    }
}

test.describe('Discount rules — compareAtPrice', () => {
    test.beforeEach(async () => {
        if (!(await esAvailable())) test.skip();
    });

    test('discounted product shows strikethrough compareAtPrice in grid view', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Grid' }).click();

        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const card = page.locator('.mv-product-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card.locator('.mv-product-card__base-price--strike')).toBeVisible({
            timeout: 10000,
        });
        await expect(card.locator('.mv-product-card__customer-price')).toBeVisible();
    });

    test('discounted product shows strikethrough compareAtPrice in list view', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const row = page.locator('.mv-product-row').first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row.locator('.mv-product-row__old-price')).toBeVisible({ timeout: 10000 });
    });

    test('non-discounted product shows no strikethrough price', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Grid' }).click();

        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-FLT-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const card = page.locator('.mv-product-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card.locator('.mv-product-card__customer-price')).toBeVisible();
        await expect(card.locator('.mv-product-card__base-price--strike')).not.toBeVisible();
    });
});
