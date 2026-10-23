import { test, expect, type Locator, type Page } from '@playwright/test';

const SEARCH_PLACEHOLDER = 'Article, VIN, brand, name or OEM';

// Fuzzy search ranks other E2E SKUs too, so pick the result by its own SKU.
const cardFor = (page: Page, sku: string): Locator =>
    page.locator('.mv-product-card').filter({
        has: page.locator('.mv-product-card__sku', { hasText: new RegExp(`^${sku}$`) }),
    });
const rowFor = (page: Page, sku: string): Locator =>
    page.locator('.mv-product-row').filter({
        has: page.locator('.mv-product-row__sku', { hasText: new RegExp(`^${sku}$`) }),
    });

test.describe('Discount rules — compareAtPrice', () => {
    test('discounted product shows strikethrough compareAtPrice in grid view', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Grid' }).click();

        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const card = cardFor(page, 'E2E-OIL-001');
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

        const row = rowFor(page, 'E2E-OIL-001');
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row.locator('.mv-product-row__old-price')).toBeVisible({ timeout: 10000 });
    });

    // Expect a discount, not none: the e2e customer's facet-less 8% DiscountGrant applies to every
    // wholesale product, even though E2E-FLT-001 matches no brand rule. Expected final: 290*0.92 -> 267.
    test('a product with no brand-specific rule still gets the customer-level account-wide grant', async ({
        page,
    }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Grid' }).click();

        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-FLT-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const card = cardFor(page, 'E2E-FLT-001');
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card.locator('.mv-product-card__base-price--strike')).toContainText('290', {
            timeout: 10000,
        });
        await expect(card.locator('.mv-product-card__customer-price')).toContainText('266.80');
    });
});

test.describe('Discount tier badge (volume/amount ladder)', () => {
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

        const card = cardFor(page, 'E2E-OIL-001');
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

        const row = rowFor(page, 'E2E-OIL-001');
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

        const card = cardFor(page, 'E2E-FLT-001');
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card.locator('.mv-discount-badge')).not.toBeVisible();
    });
});
