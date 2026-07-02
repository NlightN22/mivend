import { test, expect, type Page } from '@playwright/test';

const COUNT = '.plv-toolbar__count';
const CATALOG_BTN = '.app-header__catalog-btn';
const DROPDOWN = '.mv-catalog-dropdown';
const CAT_ITEM = '.mv-catalog-dropdown__cat';

async function waitForCount(page: Page): Promise<number> {
    await page.waitForLoadState('networkidle');
    await expect(page.locator(COUNT)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(COUNT)).not.toHaveText('Loading...', { timeout: 8000 });
    const text = await page.locator(COUNT).textContent();
    const m = text?.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

async function goToCatalog(page: Page): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
}

async function openDropdown(page: Page): Promise<void> {
    await goToCatalog(page);
    await page.locator(CATALOG_BTN).click();
    await expect(page.locator(DROPDOWN)).toBeVisible({ timeout: 5000 });
    // collections load asynchronously after dropdown opens
    await expect(page.locator(CAT_ITEM).first()).toBeVisible({ timeout: 5000 });
}

test.describe('Catalog collection navigation', () => {
    test('catalogue button opens dropdown with category list', async ({ page }) => {
        await openDropdown(page);
        const categories = page.locator(CAT_ITEM);
        expect(await categories.count()).toBeGreaterThan(0);
    });

    test('clicking a top-level category navigates to /catalog?collection=<slug>', async ({
        page,
    }) => {
        await openDropdown(page);
        await page.locator(CAT_ITEM).first().click();
        await page.waitForLoadState('networkidle');

        expect(page.url()).toContain('/catalog');
        expect(page.url()).toContain('collection=');
    });

    test('collection filter narrows product count vs full catalog', async ({ page }) => {
        await goToCatalog(page);
        const fullCount = await waitForCount(page);

        await page.locator(CATALOG_BTN).click();
        await expect(page.locator(DROPDOWN)).toBeVisible({ timeout: 5000 });
        await expect(page.locator(CAT_ITEM).first()).toBeVisible({ timeout: 5000 });
        await page.locator(CAT_ITEM).first().click();
        const filteredCount = await waitForCount(page);

        expect(filteredCount).toBeGreaterThan(0);
        expect(filteredCount).toBeLessThanOrEqual(fullCount);
    });

    test('dropdown closes after navigation', async ({ page }) => {
        await openDropdown(page);
        await page.locator(CAT_ITEM).first().click();
        await expect(page.locator(DROPDOWN)).not.toBeVisible({ timeout: 3000 });
    });

    test('navigating between two different collections updates products', async ({ page }) => {
        await goToCatalog(page);

        await page.locator(CATALOG_BTN).click();
        await expect(page.locator(CAT_ITEM).first()).toBeVisible({ timeout: 5000 });

        if ((await page.locator(CAT_ITEM).count()) < 2) {
            test.skip();
            return;
        }

        await page.locator(CAT_ITEM).first().click();
        const countA = await waitForCount(page);

        await page.locator(CATALOG_BTN).click();
        await expect(page.locator(CAT_ITEM).first()).toBeVisible({ timeout: 5000 });
        await page.locator(CAT_ITEM).nth(1).click();
        const countB = await waitForCount(page);

        expect(countA).toBeGreaterThan(0);
        expect(countB).toBeGreaterThan(0);
    });

    test('switching from collection to search clears collection param', async ({ page }) => {
        await goToCatalog(page);
        await page.locator(CATALOG_BTN).click();
        await expect(page.locator(CAT_ITEM).first()).toBeVisible({ timeout: 5000 });
        await page.locator(CAT_ITEM).first().click();
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('collection=');

        const searchInput = page.locator('.mv-search__input').first();
        await searchInput.fill('oil');
        await page.keyboard.press('Enter');
        await page.waitForLoadState('networkidle');

        expect(page.url()).toContain('q=oil');
        expect(page.url()).not.toContain('collection=');
    });
});
