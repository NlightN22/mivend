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

test.describe('Discount tier badge (volume/amount ladder)', () => {
    test.beforeEach(async () => {
        if (!(await esAvailable())) test.skip();
    });

    test('shows the tier badge with a tooltip listing the ladder in grid view', async ({
        page,
    }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Grid' }).click();

        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const card = page.locator('.mv-product-card').first();
        const badge = card.locator('.mv-discount-badge');
        await expect(badge).toBeVisible({ timeout: 10000 });
        await badge.click();
        await expect(page.locator('.mv-discount-badge__list')).toContainText('25%');
    });

    test('shows the tier badge in the price cell in list view', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const row = page.locator('.mv-product-row').first();
        await expect(row.locator('.mv-discount-badge')).toBeVisible({ timeout: 10000 });
    });

    test('never shows a tier badge for a variant with no resolvable price', async ({ page }) => {
        // E2E-FLT-001 has no brand facet at all — no ladder can ever match it, so this
        // also guards the base case (no facet -> no tiers) alongside the price-guard.
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Grid' }).click();

        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-FLT-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const card = page.locator('.mv-product-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card.locator('.mv-discount-badge')).not.toBeVisible();
    });
});
