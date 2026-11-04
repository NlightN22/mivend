import { test, expect, type Page } from '@playwright/test';

const BADGE = '.mv-product-card__match-badge, .mv-product-row__match-badge';
const IN_STOCK = 'In stock only';

async function search(page: Page, term: string): Promise<void> {
    await page.goto(`/catalog?q=${encodeURIComponent(term)}`);
    await page.waitForLoadState('networkidle');
}

test.describe('Catalog code matches (#307)', () => {
    test('an article query lists the product first with the Article badge', async ({ page }) => {
        await search(page, 'E2E-OIL-001');
        await expect(page.locator(BADGE).first()).toHaveText('Article', { timeout: 10000 });
        await expect(page.locator(BADGE)).toHaveCount(1);
        await expect(page.getByText('Engine Oil 5W-30').first()).toBeVisible();
    });

    test('a separator-insensitive article query still matches', async ({ page }) => {
        await search(page, 'e2e oil 001');
        await expect(page.locator(BADGE).first()).toHaveText('Article', { timeout: 10000 });
        await expect(page.getByText('Engine Oil 5W-30').first()).toBeVisible();
    });

    test('a part number query shows the Part number badge', async ({ page }) => {
        await search(page, 'MPN483855');
        await expect(page.locator(BADGE).first()).toHaveText('Part number', { timeout: 10000 });
        await expect(page.getByText('Oil Filter').first()).toBeVisible();
    });

    test('a manufacturer code query shows the Manufacturer code badge', async ({ page }) => {
        await search(page, '90915yzzd1');
        await expect(page.locator(BADGE).first()).toHaveText('Manufacturer code', {
            timeout: 10000,
        });
        await expect(page.getByText('Oil Filter').first()).toBeVisible();
    });

    test('a code match is not repeated among the full-text hits', async ({ page }) => {
        await search(page, 'E2E-OIL-001 oil');
        await expect(page.locator(BADGE).first()).toHaveText('Article', { timeout: 10000 });
        await expect(page.locator(BADGE)).toHaveCount(1);
    });

    test('a text-only query shows no badges', async ({ page }) => {
        await search(page, 'oil filter');
        await expect(page.getByText('Oil Filter').first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator(BADGE)).toHaveCount(0);
    });

    test('the in-stock filter applies to code matches', async ({ page }) => {
        await search(page, 'E2E-SPK-001');
        await expect(page.locator(BADGE).first()).toHaveText('Article', { timeout: 10000 });
        await expect(page.getByText('Spark Plug').first()).toBeVisible();

        await page.getByLabel(IN_STOCK).check();
        await page.waitForLoadState('networkidle');
        await expect(page.getByText('Spark Plug')).toHaveCount(0);
        await expect(page.locator(BADGE)).toHaveCount(0);
    });
});
